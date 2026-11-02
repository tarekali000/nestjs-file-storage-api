import {
  BadRequestException, ForbiddenException, Injectable, InternalServerErrorException,
  NotFoundException, PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { QueryFilesDto } from './dto/query-files.dto';
import { inspectFile } from './files.utils';

@Injectable()
export class FilesService {
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    config: ConfigService,
  ) {
    this.maxBytes = Number(config.get('MAX_FILE_SIZE_MB', 10)) * 1024 * 1024;
    this.maxFiles = Number(config.get('MAX_FILES_PER_REQUEST', 10));
  }

  async upload(file: Express.Multer.File, userId: string) {
    if (!file) throw new BadRequestException('A file is required');
    const record = await this.persistOne(file, userId);
    return this.toPublic(record);
  }

  async uploadMultiple(files: Express.Multer.File[], userId: string) {
    if (!files?.length) throw new BadRequestException('At least one file is required');
    if (files.length > this.maxFiles) throw new BadRequestException(`Maximum ${this.maxFiles} files per request`);
    const completed: any[] = [];
    try {
      for (const file of files) completed.push(await this.persistOne(file, userId));
      return { uploaded: completed.length, files: completed.map(f => this.toPublic(f)) };
    } catch (error) {
      await Promise.all(completed.map(async f => {
        await this.prisma.file.delete({ where: { id: f.id } }).catch(() => undefined);
        await this.storage.remove(f.path).catch(() => undefined);
      }));
      throw error;
    }
  }

  async list(userId: string, query: QueryFilesDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const where = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.file.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.file.count({ where }),
    ]);
    return {
      data: data.map(f => this.toPublic(f)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, userId: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    if (file.userId !== userId) throw new ForbiddenException('You do not own this file');
    return this.toPublic(file);
  }

  async getDownload(id: string, userId: string) {
    const file = await this.getOwnedRecord(id, userId);
    if (!(await this.storage.exists(file.path))) throw new NotFoundException('Stored file is missing');
    return { file, stream: this.storage.stream(file.path) };
  }

  async remove(id: string, userId: string) {
    const file = await this.getOwnedRecord(id, userId);
    let trashPath: string | undefined;
    let metadataDeleted = false;
    try {
      trashPath = await this.storage.moveToTrash(file.path);
      await this.prisma.file.delete({ where: { id } });
      metadataDeleted = true;
    } catch {
      if (trashPath) await this.storage.restoreFromTrash(trashPath, file.path).catch(() => undefined);
      throw new InternalServerErrorException('Could not safely delete file; retry or inspect storage');
    }
    // Once metadata is deleted, the file is no longer addressable. A failed unlink
    // leaves a quarantined .deleting file for operational cleanup, not a live upload.
    if (metadataDeleted && trashPath) await this.storage.remove(trashPath).catch(() => undefined);
  }

  async stats(userId: string) {
    const files = await this.prisma.file.findMany({
      where: { userId }, select: { size: true, mimeType: true },
    });
    const fileTypes: Record<string, number> = {};
    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
      fileTypes[file.mimeType] = (fileTypes[file.mimeType] || 0) + 1;
    }
    return {
      totalFiles: files.length,
      totalSize,
      totalSizeMB: Number((totalSize / (1024 * 1024)).toFixed(2)),
      fileTypes,
    };
  }

  private async persistOne(file: Express.Multer.File, userId: string) {
    if (!file?.buffer) throw new BadRequestException('Invalid upload');
    if (file.size > this.maxBytes) throw new PayloadTooLargeException(`Maximum file size is ${this.maxBytes / (1024 * 1024)} MB`);
    const details = inspectFile(file);
    const saved = await this.storage.save(file.buffer, details.extension);
    try {
      return await this.prisma.file.create({
        data: {
          originalName: details.originalName,
          storedName: saved.storedName,
          mimeType: details.mimeType,
          size: file.size,
          path: saved.path,
          checksum: details.checksum,
          userId,
        },
      });
    } catch (error) {
      await this.storage.remove(saved.path).catch(() => undefined);
      throw error;
    }
  }

  private async getOwnedRecord(id: string, userId: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    if (file.userId !== userId) throw new ForbiddenException('You do not own this file');
    return file;
  }

  private toPublic(file: any) {
    const { path, userId, ...safe } = file;
    return safe;
  }
}
