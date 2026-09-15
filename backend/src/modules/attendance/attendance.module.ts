import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { OrganizationModule } from '../organization/organization.module';
import { AttendanceController, OvertimeController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { OvertimeService } from './overtime.service';

@Module({
  imports: [OrganizationModule],
  controllers: [AttendanceController, OvertimeController],
  providers: [AttendanceService, OvertimeService, SequenceService],
  exports: [AttendanceService, OvertimeService],
})
export class AttendanceModule {}
