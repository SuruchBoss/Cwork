import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';
import { FilesModule } from '../files/files.module';
import { LeaveModule } from '../leave/leave.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { JobLockService } from './job-lock.service';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [AttendanceModule, EmployeesModule, FilesModule, LeaveModule, RecruitmentModule],
  providers: [JobLockService, ScheduledTasksService],
  exports: [JobLockService],
})
export class JobsModule {}
