import {
  Controller, Delete, Get, Param, Post, Query, Req, Res, UploadedFile,
  UploadedFiles, UseGuards, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse,
  ApiOperation, ApiParam, ApiProduces, ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { FilesService } from './files.service';
import { QueryFilesDto } from './dto/query-files.dto';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @ApiCreatedResponse({ description: 'File uploaded; metadata returned without the physical path' })
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.files.upload(file, (req as any).user.id);
  }

  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } }, required: ['files'] } })
  @ApiCreatedResponse({ description: 'Uploaded files' })
  uploadMultiple(@UploadedFiles() files: Express.Multer.File[], @Req() req: Request) {
    return this.files.uploadMultiple(files, (req as any).user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user files with pagination' })
  @ApiOkResponse({ description: 'Paginated file metadata' })
  list(@Req() req: Request, @Query() query: QueryFilesDto) {
    return this.files.list((req as any).user.id, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get storage statistics for the authenticated user' })
  stats(@Req() req: Request) { return this.files.stats((req as any).user.id); }

  @Get(':id/download')
  @ApiParam({ name: 'id', description: 'File UUID' })
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: 'Download an owned file as a binary stream' })
  async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const result = await this.files.getDownload(id, (req as any).user.id);
    res.setHeader('Content-Type', result.file.mimeType);
    res.setHeader('Content-Length', result.file.size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`);
    result.stream.on('error', () => { if (!res.headersSent) res.sendStatus(404); else res.destroy(); });
    result.stream.pipe(res);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'File UUID' })
  @ApiOkResponse({ description: 'File metadata' })
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.files.findOne(id, (req as any).user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'File UUID' })
  @ApiOperation({ summary: 'Delete an owned file from storage and database' })
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.files.remove(id, (req as any).user.id);
  }
}
