import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApprovalOutcomeRegistry } from './approval-outcome.registry';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';

@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [ApprovalController],
  providers: [ApprovalService, ApprovalOutcomeRegistry],
  exports: [ApprovalService, ApprovalOutcomeRegistry],
})
export class ApprovalsModule {}
