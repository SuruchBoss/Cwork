import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { OutboxService } from '../../core/outbox/outbox.service';
import { CATCH_ALL } from './domain/delivery-rules';
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
 * beside it and relayed by `OutboxDispatcher`. The pairing is the point: a
 * notification and its delivery instruction commit together, so no email is
 * ever sent for a notification that does not exist.
 *
 * Handlers for `notification.raised` are what turn those events into messages.
 * Until one is registered the dispatcher relays them to nobody and marks them
 * delivered, which is the honest answer for a deployment with no provider
 * configured — see CW-005 in the backlog.
 *
 * ## Which method to call
 *
 * `notifyIn` takes the caller's transaction client and is the one to reach for.
 * "Approved, and told them so" is one fact: with the notification inside the
 * approval's transaction, a crash between the two cannot leave an approval
 * nobody was told about, and a rolled-back approval cannot leave a message
 * saying it happened. It throws, on purpose — it is part of the unit of work
 * now, and swallowing an error inside a transaction only means committing a
 * half of it.
 *
 * `notify` runs in a transaction of its own and swallows failures. It is for
 * the handful of callers with nothing to join — telling somebody an upload was
 * refused, when the whole point is that nothing was stored.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** One recipient, inside the caller's transaction. Prefer this. */
  async notifyIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    await this.notifyManyIn(tx, organizationId, [userId], payload);
  }

  /**
   * Several recipients, inside the caller's transaction.
   *
   * Throws. The notification is part of the change now, so a failure here has
   * to take the change with it — and inside a transaction there is nothing else
   * it *could* do: PostgreSQL has already aborted, and catching the error would
   * only move the failure to the commit.
   */
  async notifyManyIn(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userIds: string[],
    payload: NotificationPayload,
  ): Promise<void> {
    const recipients = [...new Set(userIds)].filter(Boolean);
    if (recipients.length === 0) return;

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

    // One event per recipient rather than one for the batch: a send that fails
    // for one address should be retried for that address, not for everyone who
    // already received it.
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
  }

  /**
   * One recipient, in a transaction of its own, best effort.
   *
   * For callers with no business write to join — see the note on the class.
   * Everywhere else, `notifyIn` is the one you want.
   */
  async notify(
    organizationId: string,
    userId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    await this.notifyMany(organizationId, [userId], payload);
  }

  /** Several recipients, in a transaction of its own, best effort. */
  async notifyMany(
    organizationId: string,
    userIds: string[],
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      await this.prisma.$transaction((tx) =>
        this.notifyManyIn(tx, organizationId, userIds, payload),
      );
    } catch (error) {
      // There is no business operation to fail here, so the only thing left to
      // do is say so loudly and carry on.
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

  // ---------------------------------------------------------------- preferences

  /** Every rule this person has set. Absence means every channel is on. */
  listPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
      select: { type: true, email: true, push: true, updatedAt: true },
    });
  }

  /**
   * Sets one rule. `type` is `*` for everything without a rule of its own.
   *
   * Only the channels named are changed, so turning email off does not quietly
   * re-enable push for somebody who had turned it off last month.
   */
  async setPreference(userId: string, type: string, channels: { email?: boolean; push?: boolean }) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, email: channels.email ?? true, push: channels.push ?? true },
      update: {
        ...(channels.email === undefined ? {} : { email: channels.email }),
        ...(channels.push === undefined ? {} : { push: channels.push }),
      },
      select: { type: true, email: true, push: true, updatedAt: true },
    });
  }

  /**
   * What an unsubscribe link does: email off for everything, push untouched.
   *
   * Untouched on purpose. The link is in an email, clicked by somebody who has
   * had enough of email; silencing their phone as well would be answering a
   * question they did not ask.
   */
  async unsubscribeFromEmail(userId: string): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: CATCH_ALL } },
      create: { userId, type: CATCH_ALL, email: false, push: true },
      update: { email: false },
    });
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
