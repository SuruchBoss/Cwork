// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { DocumentExpiryService } from './document-expiry.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeesController, OffboardingController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OffboardingService } from './offboarding.service';
import { EmployeeRetentionService } from './retention.service';

@Module({
  imports: [AttendanceModule],
  controllers: [EmployeesController, OffboardingController],
  providers: [
    EmployeesService,
    DocumentExpiryService,
    EmployeeImportService,
    OffboardingService,
    EmployeeRetentionService,
    SequenceService,
  ],
  exports: [DocumentExpiryService, EmployeesService, OffboardingService, EmployeeRetentionService],
})
export class EmployeesModule {}
