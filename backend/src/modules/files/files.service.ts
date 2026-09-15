import { Injectable } from '@nestjs/common';
import { FileScanStatus, FileVisibility } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { StorageService } from './storage.service';

/** Upload allow-list. Anything not here is rejected, including archives. */
const ALLOWED_MIME_TYPES = new Map<string, string[]>([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
  ['image/heic', ['.heic']],
  ['application/pdf', ['.pdf']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['.docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']],
  ['text/csv', ['.csv']],
  ['text/plain', ['.txt', '.md']],
]);

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Magic-byte prefixes, checked so a .exe renamed to .pdf is still rejected. */
const MAGIC_BYTES: Array<{ mime: string; signature: number[] }> = [
  { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
];

export interface UploadInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  prefix: string;
  visibility?: FileVisibility;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(user: AuthenticatedUser, input: UploadInput) {
    this.assertAcceptable(input);

    const stored = await this.storage.put(
      input.prefix,
      input.originalName,
      input.buffer,
      input.mimeType,
    );

    return this.prisma.fileObject.create({
      data: {
        organizationId: user.organizationId,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        filename: input.originalName.slice(0, 200),
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        visibility: input.visibility ?? FileVisibility.PRIVATE,
        // No AV integration ships by default; deployments that need one flip
        // this to PENDING and run a scanner over the bucket.
        scanStatus: FileScanStatus.SKIPPED,
        uploadedById: user.userId,
      },
    });
  }

  async getMetadata(organizationId: string, id: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!file) throw new NotFoundError('File', id);
    return file;
  }

  async download(
    organizationId: string,
    id: string,
  ): Promise<{ file: Awaited<ReturnType<FilesService['getMetadata']>>; content: Buffer }> {
    const file = await this.getMetadata(organizationId, id);
    if (file.scanStatus === FileScanStatus.INFECTED) {
      throw new BusinessRuleError(
        'FILE_INFECTED',
        'This file was quarantined by the malware scanner',
      );
    }
    const content = await this.storage.get(file.objectKey);
    return { file, content };
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    const file = await this.getMetadata(organizationId, id);
    await this.prisma.fileObject.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
  }

  private assertAcceptable(input: UploadInput): void {
    if (input.buffer.length === 0) {
      throw new BusinessRuleError('EMPTY_FILE', 'The uploaded file is empty');
    }
    if (input.buffer.length > MAX_FILE_BYTES) {
      throw new BusinessRuleError(
        'FILE_TOO_LARGE',
        `Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller`,
      );
    }

    const extensions = ALLOWED_MIME_TYPES.get(input.mimeType);
    if (!extensions) {
      throw new BusinessRuleError(
        'UNSUPPORTED_FILE_TYPE',
        `Files of type ${input.mimeType} are not accepted`,
      );
    }

    const lower = input.originalName.toLowerCase();
    if (!extensions.some((ext) => lower.endsWith(ext))) {
      throw new BusinessRuleError(
        'EXTENSION_MISMATCH',
        `A ${input.mimeType} file must have one of these extensions: ${extensions.join(', ')}`,
      );
    }

    const expected = MAGIC_BYTES.find((m) => m.mime === input.mimeType);
    if (expected) {
      const header = [...input.buffer.subarray(0, expected.signature.length)];
      const matches = expected.signature.every((byte, i) => header[i] === byte);
      if (!matches) {
        throw new BusinessRuleError(
          'CONTENT_TYPE_MISMATCH',
          'The file contents do not match the declared type',
        );
      }
    }
  }
}
