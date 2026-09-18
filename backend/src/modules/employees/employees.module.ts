import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { EmployeesController, OffboardingController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OffboardingService } from './offboarding.service';
import { EmployeeRetentionService } from './retention.service';

@Module({
  controllers: [EmployeesController, OffboardingController],
  providers: [EmployeesService, OffboardingService, EmployeeRetentionService, SequenceService],
  exports: [EmployeesService, OffboardingService, EmployeeRetentionService],
})
export class EmployeesModule {}
