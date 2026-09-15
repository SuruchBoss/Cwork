import { Global, Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { FcmClient } from './fcm.client';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmtpClient } from './smtp.client';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmtpClient, FcmClient, DeliveryService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
