import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { FilesService } from './files.service';

/**
 * What a single upload is allowed to be, stated in full.
 *
 * Multer's defaults are unbounded where it matters — `fields` and `parts` are
 * `Infinity` — so a request that never sends a file at all can still keep a
 * worker parsing. The advisories behind the multer upgrade
 * (GHSA-wc9g-mqfw-jrwm, GHSA-535w-7cp7-47q4) are exactly that shape: crafted
 * *field names*, not crafted file bytes. The upgrade fixes the parser; these
 * limits mean the next one has nothing to work on.
 *
 * The endpoint's contract is one part, named `file`, and nothing else. Anything
 * beyond that is refused with a 400 — by `AllExceptionsFilter`, which reads
 * multer's error code — before a byte reaches the scanner or storage.
 *
 * `fields: 0` is what makes `fieldNestingDepth` and `fieldArrayIndexLimit`
 * unnecessary here: busboy refuses a text part before multer ever parses its
 * name. Both still default to `Infinity` in multer 2.4 — so if this endpoint
 * ever accepts text fields, set them at the same time.
 */
const UPLOAD_LIMITS = {
  fileSize: 20 * 1024 * 1024,
  files: 1,
  /** No text fields accompany the file, so none are accepted. */
  fields: 0,
  /** fields + files: the file part, and nothing after it. */
  parts: 1,
  /** Multer's own default, restated so a version bump cannot quietly raise it. */
  fieldNameSize: 100,
  /** A part normally carries two headers; 32 is slack, not room to abuse. */
  headerPairs: 32,
} as const;

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @Audited({ action: AuditAction.CREATE, entityType: 'FileObject' })
  @ApiOperation({ summary: 'Upload an attachment (receipts, certificates, selfies)' })
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    return this.files.upload(user, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      prefix: `org/${user.organizationId}`,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'File metadata' })
  metadata(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.getMetadata(user.organizationId, id);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Download file contents' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { file, content } = await this.files.download(user.organizationId, id);
    res.setHeader('Content-Type', file.mimeType);
    // `attachment` + nosniff prevents an uploaded SVG/HTML from executing in
    // the context of the app's origin.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.send(content);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'FileObject' })
  @ApiOperation({ summary: 'Soft-delete a file' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.files.softDelete(user.organizationId, id);
  }
}
