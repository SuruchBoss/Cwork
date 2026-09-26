// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { OrganizationModule } from '../organization/organization.module';
import { AttendanceController, OvertimeController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { LatePunchConfirmationService } from './late-punch.service';
import { OvertimeService } from './overtime.service';
import { ShiftController } from './shift.controller';
import { ShiftService } from './shift.service';

@Module({
  imports: [OrganizationModule],
  controllers: [AttendanceController, OvertimeController, ShiftController],
  providers: [
    AttendanceService,
    LatePunchConfirmationService,
    OvertimeService,
    ShiftService,
    SequenceService,
  ],
  exports: [AttendanceService, OvertimeService, ShiftService],
})
export class AttendanceModule {}
