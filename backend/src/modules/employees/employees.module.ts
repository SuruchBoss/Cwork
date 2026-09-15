import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { EmployeesController, OffboardingController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OffboardingService } from './offboarding.service';

@Module({
  controllers: [EmployeesController, OffboardingController],
  providers: [EmployeesService, OffboardingService, SequenceService],
  exports: [EmployeesService, OffboardingService],
})
export class EmployeesModule {}
