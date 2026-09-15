import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: NotificationChannel;
}

/**
 * In-app notifications, written straight to the database.
 *
 * Email and push are intentionally *not* implemented here — every deployment
 * has a different provider. `PushDispatcher` is the seam: implement it and
 * register it in this module to fan out to FCM/APNs or an SMTP relay.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(
    organizationId: string,
    userId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    await this.notifyMany(organizationId, [userId], payload);
  }

  async notifyMany(
    organizationId: string,
    userIds: string[],
    payload: NotificationPayload,
  ): Promise<void> {
    const recipients = [...new Set(userIds)].filter(Boolean);
    if (recipients.length === 0) return;

    try {
      await this.prisma.notification.createMany({
        data: recipients.map((userId) => ({
          organizationId,
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: (payload.data ?? {}) as Prisma.InputJsonValue,
          channel: payload.channel ?? NotificationChannel.IN_APP,
        })),
      });
    } catch (error) {
      // Never let a notification failure roll back the business operation.
      this.logger.error(
        `Failed to create notifications of type ${payload.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  list(userId: string, onlyUnread = false, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId, ...(onlyUnread ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, ids?: string[]): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: string,
    deviceId?: string,
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId },
      update: { userId, platform, deviceId, lastSeenAt: new Date() },
    });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }
}
