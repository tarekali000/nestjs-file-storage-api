import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

const signatures: Record<string, Buffer[]> = {
  '.png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  '.jpg': [Buffer.from([0xff, 0xd8, 0xff])],
  '.jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  '.webp': [Buffer.from('RIFF'), Buffer.from('WEBP')],
  '.pdf': [Buffer.from('%PDF-')],
  '.zip': [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.from([0x50, 0x4b, 0x07, 0x08])],
  '.docx': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
};

const mimeByExt: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain', '.zip': 'application/zip',
};

export function inspectFile(file: Express.Multer.File) {
  const originalName = file.originalname.replace(/\\\\/g, '/').split('/').pop() || 'file';
  const ext = originalName.includes('.') ? `.${originalName.split('.').pop()!.toLowerCase()}` : '';
  if (!mimeByExt[ext]) throw new BadRequestException('File extension is not allowed');

  let detected = false;
  if (ext === '.txt') {
    detected = !file.buffer.includes(0) && isValidUtf8(file.buffer);
  } else if (ext === '.webp') {
    detected = file.buffer.length >= 12 && file.buffer.subarray(0, 4).equals(Buffer.from('RIFF')) && file.buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
  } else if (ext === '.docx') {
    detected = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      && file.buffer.includes(Buffer.from('[Content_Types].xml'))
      && file.buffer.includes(Buffer.from('word/document.xml'));
  } else {
    detected = signatures[ext].some(sig => file.buffer.subarray(0, sig.length).equals(sig));
  }
  if (!detected) throw new BadRequestException('File content does not match the allowed file type');
  return {
    originalName,
    extension: ext,
    mimeType: mimeByExt[ext],
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
  };
}

function isValidUtf8(buffer: Buffer) {
  return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
}
