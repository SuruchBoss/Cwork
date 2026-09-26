// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, DocumentRequestStatus } from '@prisma/client';
import type { Response } from 'express';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { Public, RequireAnyPermission, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { DocumentsService } from './documents.service';
import { CreateDocumentRequestDto, IssueDocumentDto, RejectDocumentDto } from './dto/document.dto';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('requests')
  @RequirePermissions(Permission.DOCUMENT_REQUEST_SELF)
  @Audited({ action: AuditAction.CREATE, entityType: 'DocumentRequest' })
  @ApiOperation({ summary: 'Request an HR document (ขอเอกสาร)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDocumentRequestDto) {
    return this.documents.create(user, dto);
  }

  @Get('requests')
  @RequireAnyPermission(Permission.DOCUMENT_ISSUE, Permission.DOCUMENT_REQUEST_SELF)
  @ApiOperation({ summary: 'List document requests visible to the caller' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: DocumentRequestStatus,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.documents.list(user, { status, employeeId });
  }

  @Get('requests/:id')
  @RequireAnyPermission(Permission.DOCUMENT_ISSUE, Permission.DOCUMENT_REQUEST_SELF)
  @ApiOperation({ summary: 'Document request detail' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.findOne(user, id);
  }

  @Get('requests/:id/certificate-data')
  @RequirePermissions(Permission.DOCUMENT_ISSUE)
  @Audited({
    action: AuditAction.READ,
    entityType: 'DocumentRequest',
    summary: 'Certificate data generated',
  })
  @ApiOperation({
    summary: 'Merge data for the certificate template',
    description: 'Salary is included only when the request explicitly asked for it.',
  })
  certificateData(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.buildCertificateData(user.organizationId, id);
  }

  @Post('requests/:id/issue')
  @RequirePermissions(Permission.DOCUMENT_ISSUE)
  @Audited({
    action: AuditAction.UPDATE,
    entityType: 'DocumentRequest',
    summary: 'Document issued',
  })
  @ApiOperation({ summary: 'Mark a document as issued' })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueDocumentDto,
  ) {
    return this.documents.issue(user, id, dto.note);
  }

  @Get('requests/:id/pdf')
  @RequireAnyPermission(Permission.DOCUMENT_ISSUE, Permission.DOCUMENT_REQUEST_SELF)
  @ApiOperation({ summary: 'Download the issued certificate PDF (requester or document:issue)' })
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { file, content, referenceNo } = await this.documents.getPdf(user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${referenceNo}.pdf"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(content);
  }

  @Public()
  @Get('verify')
  @ApiOperation({
    summary: 'Verify a certificate is genuine',
    description:
      'Public. Confirms a document from its reference number and printed code, disclosing only ' +
      'enough to confirm authenticity — never salary.',
  })
  verify(@Query('ref') ref: string, @Query('code') code: string) {
    return this.documents.verify(ref ?? '', code ?? '');
  }

  @Post('requests/:id/reject')
  @RequirePermissions(Permission.DOCUMENT_ISSUE)
  @Audited({
    action: AuditAction.UPDATE,
    entityType: 'DocumentRequest',
    summary: 'Document request rejected',
  })
  @ApiOperation({ summary: 'Reject a document request' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.documents.reject(user, id, dto.reason);
  }
}
