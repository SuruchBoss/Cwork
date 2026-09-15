import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, FileScanStatus, FileVisibility } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MalwareScannerService, type ScanOutcome } from './malware-scanner.service';
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

/** How a scan outcome lands in the database. */
function scanStatusFor(outcome: ScanOutcome): FileScanStatus {
  switch (outcome.status) {
    case 'clean':
      return FileScanStatus.CLEAN;
    case 'infected':
      return FileScanStatus.INFECTED;
    case 'skipped':
      return FileScanStatus.SKIPPED;
    case 'unavailable':
      // Deliberately not SKIPPED: the file is held, not waved through.
      return FileScanStatus.PENDING;
  }
}

export interface UploadInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  prefix: string;
  visibility?: FileVisibility;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scanner: MalwareScannerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Validates, stores and scans an upload.
   *
   * The scan happens inside the request rather than on a queue. There is no
   * broker in this deployment, and for a 20 MB ceiling a clamd verdict arrives
   * in well under a second — which buys the thing a queue cannot: the person
   * uploading an infected résumé is told so immediately, instead of
   * discovering it never arrived. A scan that cannot complete leaves the file
   * `PENDING` and undownloadable, and the nightly sweep retries it.
   */
  async upload(user: AuthenticatedUser, input: UploadInput) {
    this.assertAcceptable(input);

    // Scan before the bytes are written: malware that is never stored cannot
    // be served by a path someone forgets to check.
    const outcome = await this.scanner.scan(input.buffer);

    if (outcome.status === 'infected') {
      await this.recordInfectedUpload(user, input, outcome.signature);
      throw new BusinessRuleError(
        'FILE_INFECTED',
        `This file was rejected by the malware scanner (${outcome.signature})`,
      );
    }

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
        scanStatus: scanStatusFor(outcome),
        uploadedById: user.userId,
      },
    });
  }

  /**
   * Leaves a record of a rejected upload without keeping the file.
   *
   * The bytes are never stored, so there is nothing to quarantine — but the
   * attempt is exactly the sort of thing whoever reviews the audit trail needs
   * to see, and the uploader needs to know their file did not arrive.
   */
  private async recordInfectedUpload(
    user: AuthenticatedUser,
    input: UploadInput,
    signature: string,
  ): Promise<void> {
    const filename = input.originalName.slice(0, 200);
    this.logger.warn(`Rejected upload "${filename}" from ${user.email}: ${signature}`);

    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.CREATE,
      entityType: 'FileObject',
      summary: `Upload rejected by malware scanner: ${filename} (${signature})`,
      changes: { filename, mimeType: input.mimeType, sizeBytes: input.buffer.length, signature },
    });

    // Best-effort, and correctly so: nothing was stored, so there is no write
    // for this to be atomic with. The audit entry above is the record that
    // matters; this is the courtesy of saying so to the person who tried.
    await this.notifications.notify(user.organizationId, user.userId, {
      type: 'FILE_INFECTED',
      title: 'ไฟล์ถูกปฏิเสธ',
      body: `ไฟล์ "${filename}" ถูกปฏิเสธเนื่องจากตรวจพบมัลแวร์ (${signature})`,
      data: { filename, signature },
    });
  }

  /**
   * Rescans a file that was stored without a verdict, and quarantines it if it
   * turns out to be malware.
   *
   * Reached from the nightly sweep. Returns the status the file ended on.
   */
  async rescan(fileId: string): Promise<FileScanStatus> {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, deletedAt: null },
    });
    if (!file) throw new NotFoundError('File', fileId);
    if (file.scanStatus !== FileScanStatus.PENDING) return file.scanStatus;

    let content: Buffer;
    try {
      content = await this.storage.get(file.objectKey);
    } catch (error) {
      this.logger.warn(`Cannot rescan ${file.id}: ${String(error)}`);
      return FileScanStatus.PENDING;
    }

    const outcome = await this.scanner.scan(content);
    if (outcome.status === 'unavailable') return FileScanStatus.PENDING;

    const scanStatus = scanStatusFor(outcome);

    if (outcome.status === 'infected') {
      // Quarantine is destruction here: the record and the signature survive,
      // the bytes do not. Keeping malware on disk to look at later is a
      // decision an HRIS has no business making on its owner's behalf.
      await this.storage.remove(file.objectKey);
      this.logger.warn(`Quarantined ${file.id} (${file.filename}): ${outcome.signature}`);

      await this.audit.record({
        organizationId: file.organizationId,
        actorUserId: file.uploadedById ?? undefined,
        action: AuditAction.UPDATE,
        entityType: 'FileObject',
        entityId: file.id,
        summary: `Quarantined by malware scanner: ${file.filename} (${outcome.signature})`,
        changes: { scanStatus, signature: outcome.signature },
      });

      // The quarantine and the notice about it commit together: a file marked
      // INFECTED that its uploader was never told about is a download that
      // starts failing with no explanation.
      await this.prisma.$transaction(async (tx) => {
        await tx.fileObject.update({ where: { id: file.id }, data: { scanStatus } });

        if (file.uploadedById) {
          await this.notifications.notifyIn(tx, file.organizationId, file.uploadedById, {
            type: 'FILE_INFECTED',
            title: 'ไฟล์ถูกกักกัน',
            body: `ไฟล์ "${file.filename}" ถูกลบออกหลังตรวจพบมัลแวร์ (${outcome.signature})`,
            data: { fileId: file.id, signature: outcome.signature },
          });
        }
      });
    } else {
      await this.prisma.fileObject.update({ where: { id: file.id }, data: { scanStatus } });
    }

    return scanStatus;
  }

  /** Files stored without a verdict, oldest first. Used by the nightly sweep. */
  async findPending(limit = 100) {
    return this.prisma.fileObject.findMany({
      where: { scanStatus: FileScanStatus.PENDING, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
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

    // Deny-by-default: only a file that has been cleared, or one from a
    // deployment that never scans, is served. PENDING means the scanner has
    // not had its say yet, and "not yet checked" is not "safe".
    if (file.scanStatus === FileScanStatus.INFECTED) {
      throw new BusinessRuleError(
        'FILE_INFECTED',
        'This file was quarantined by the malware scanner',
      );
    }
    if (file.scanStatus === FileScanStatus.PENDING) {
      throw new BusinessRuleError(
        'FILE_SCAN_PENDING',
        'This file has not been scanned yet. Try again shortly.',
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
