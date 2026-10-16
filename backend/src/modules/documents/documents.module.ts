// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { FilesModule } from '../files/files.module';
import { CashSheetRenderer } from './cash-sheet-renderer';
import { CertificateRenderer } from './certificate-renderer';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PayslipRenderer, WageReceiptRenderer } from './payslip-renderer';
import { SsoFilingRenderer } from './sso-filing-renderer';

@Module({
  imports: [FilesModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    CertificateRenderer,
    PayslipRenderer,
    WageReceiptRenderer,
    CashSheetRenderer,
    SsoFilingRenderer,
    SequenceService,
  ],
  exports: [
    DocumentsService,
    PayslipRenderer,
    WageReceiptRenderer,
    CashSheetRenderer,
    SsoFilingRenderer,
  ],
})
export class DocumentsModule {}
