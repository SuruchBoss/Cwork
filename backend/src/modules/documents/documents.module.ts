// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { FilesModule } from '../files/files.module';
import { CertificateRenderer } from './certificate-renderer';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [FilesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, CertificateRenderer, SequenceService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
