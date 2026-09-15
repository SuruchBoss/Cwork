import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { OutboxService } from '../../core/outbox/outbox.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Raised once per notification row, for anything that delivers it elsewhere.
 * Exported so a handler registers for the same string this publishes, rather
 * than for a copy of it that can drift.
 */
export const NOTIFICATION_RAISED = 'notification.raised';

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
 * The row is written synchronously because the console reads it back
 * immediately; what goes *out* — email, push — is recorded as an outbox event
 * in the same transaction and relayed by `OutboxDispatcher`. The pairing is the
 * point: a notification and its delivery instruction commit together, so no
 * email is ever sent for a notification that does not exist, and none is lost
 * because the process died a moment after writing the row.
 *
 * Handlers for `notification.raised` are what turn those events into messages.
 * Until one is registered the dispatcher relays them to nobody and marks them
 * delivered, which is the honest answer for a deployment with no provider
 * configured — see CW-005 in the backlog.
 *
 * Note what this is *not*: the caller's own transaction. Callers notify after
 * their business transaction has committed, so a notification can still be lost
 * if the process dies in between. Closing that gap means passing the caller's
 * transaction client all the way down, which is a change to every call site.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

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
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.notification.createManyAndReturn({
          data: recipients.map((userId) => ({
            organizationId,
            userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            data: (payload.data ?? {}) as Prisma.InputJsonValue,
            channel: payload.channel ?? NotificationChannel.IN_APP,
          })),
          select: { id: true, userId: true },
        });

        // One event per recipient rather than one for the batch: a send that
        // fails for one address should be retried for that address, not for
        // everyone who already received it.
        await this.outbox.recordMany(
          tx,
          created.map((notification) => ({
            organizationId,
            eventType: NOTIFICATION_RAISED,
            aggregateType: 'Notification',
            aggregateId: notification.id,
            payload: {
              userId: notification.userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              data: payload.data ?? {},
            },
          })),
        );
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
