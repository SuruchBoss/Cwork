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

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
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
