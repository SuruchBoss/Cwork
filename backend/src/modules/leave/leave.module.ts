import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { OrganizationModule } from '../organization/organization.module';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [OrganizationModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveBalanceService, SequenceService],
  exports: [LeaveService, LeaveBalanceService],
})
export class LeaveModule {}
