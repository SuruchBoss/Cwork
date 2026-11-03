// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Global, Module } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MalwareScannerService } from './malware-scanner.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [FilesService, FileAccessService, StorageService, MalwareScannerService],
  exports: [FilesService, FileAccessService, StorageService, MalwareScannerService],
})
export class FilesModule {}
