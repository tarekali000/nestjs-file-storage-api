import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { join, relative, resolve, isAbsolute, sep } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', './storage/uploads'));
  }

  async ensureRoot() { await fs.mkdir(this.root, { recursive: true }); }

  async save(buffer: Buffer, extension: string) {
    await this.ensureRoot();
    const storedName = `${randomUUID()}${extension}`;
    const finalPath = join(this.root, storedName);
    const tempPath = join(this.root, `.${storedName}.tmp`);
    try {
      await fs.writeFile(tempPath, buffer, { flag: 'wx', mode: 0o600 });
      await fs.rename(tempPath, finalPath);
      return { storedName, path: finalPath };
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw new InternalServerErrorException('Could not persist uploaded file');
    }
  }

  async remove(path: string) {
    this.assertInsideRoot(path);
    await fs.rm(path, { force: true });
  }

  async exists(path: string) {
    this.assertInsideRoot(path);
    try { await fs.access(path); return true; } catch { return false; }
  }

  stream(path: string): Readable {
    this.assertInsideRoot(path);
    return createReadStream(path);
  }

  async moveToTrash(path: string) {
    this.assertInsideRoot(path);
    const trashPath = `${path}.${randomUUID()}.deleting`;
    await fs.rename(path, trashPath);
    return trashPath;
  }

  async restoreFromTrash(trashPath: string, originalPath: string) {
    this.assertInsideRoot(trashPath);
    this.assertInsideRoot(originalPath);
    await fs.rename(trashPath, originalPath);
  }

  private assertInsideRoot(path: string) {
    const target = resolve(path);
    const rel = relative(this.root, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new InternalServerErrorException('Unsafe storage path');
    }
  }
}