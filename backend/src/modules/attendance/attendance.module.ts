import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { OrganizationModule } from '../organization/organization.module';
import { AttendanceController, OvertimeController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { OvertimeService } from './overtime.service';
import { ShiftController } from './shift.controller';
import { ShiftService } from './shift.service';

@Module({
  imports: [OrganizationModule],
  controllers: [AttendanceController, OvertimeController, ShiftController],
  providers: [AttendanceService, OvertimeService, ShiftService, SequenceService],
  exports: [AttendanceService, OvertimeService, ShiftService],
})
export class AttendanceModule {}
