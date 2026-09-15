import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { PermanentDeliveryError } from '../../core/outbox/delivery-error';
import { OutboxRegistry, type OutboxEventRecord } from '../../core/outbox/outbox.registry';
import { PrismaService } from '../../core/prisma/prisma.service';
import { channelEnabled } from './domain/delivery-rules';
import { renderEmail } from './domain/email-template';
import { createUnsubscribeToken } from './domain/unsubscribe-token';
import { FcmClient } from './fcm.client';
import { NOTIFICATION_RAISED } from './notifications.service';
import { SmtpClient } from './smtp.client';

interface RaisedPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Turns `notification.raised` into actual messages.
 *
 * Registered as two outbox handlers rather than one, because email and push
 * fail for entirely unrelated reasons and a relay being down should not stop
 * a phone from buzzing. The outbox calls both for the same event and judges
 * them together, so a failure in either retries the pair — which is why both
 * are written to be safe to repeat.
 *
 * Neither handler decides *whether* somebody is notified. That already
 * happened: the in-app row exists and is the record. These decide whether the
 * person also hears about it somewhere else, which is a preference, and one
 * they can revoke from a link in the footer.
 */
@Injectable()
export class DeliveryService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
    private readonly smtp: SmtpClient,
    private readonly fcm: FcmClient,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  onModuleInit(): void {
    if (this.smtp.enabled) {
      this.registry.register(NOTIFICATION_RAISED, (event) => this.deliverEmail(event));
      this.logger.log(
        `Email delivery on via ${this.config.delivery.email.host}:${this.config.delivery.email.port}`,
      );
    } else {
      this.logger.warn('Email delivery is off (EMAIL_ENABLED=false) — nothing will be sent');
    }

    if (this.fcm.enabled) {
      this.registry.register(NOTIFICATION_RAISED, (event) => this.deliverPush(event));
      this.logger.log(`Push delivery on via FCM project ${this.config.delivery.push.projectId}`);
    } else {
      this.logger.warn('Push delivery is off (PUSH_ENABLED=false) — nothing will be sent');
    }
  }

  // ------------------------------------------------------------------- email

  private async deliverEmail(event: OutboxEventRecord): Promise<void> {
    const payload = event.payload as unknown as RaisedPayload;
    const recipient = await this.recipient(payload.userId);

    if (!recipient) {
      // The account was deleted between raising the event and relaying it.
      // Nothing to deliver and nothing to retry: this is a delivered event.
      this.logger.debug(`No active recipient for ${payload.userId}; dropping email`);
      return;
    }

    if (!channelEnabled(recipient.preferences, payload.type, 'email')) return;

    const email = renderEmail({
      type: payload.type,
      title: payload.title,
      body: payload.body,
      recipientName: recipient.name,
      webUrl: this.config.delivery.publicWebUrl,
      unsubscribeUrl: this.unsubscribeUrl(recipient.id),
    });

    await this.smtp.send({
      from: {
        name: this.config.delivery.email.fromName,
        address: this.config.delivery.email.fromAddress,
      },
      to: recipient.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        // What makes the one-click unsubscribe button appear in Gmail and
        // friends, instead of the recipient reaching for "report spam".
        'List-Unsubscribe': `<${this.unsubscribeUrl(recipient.id)}>`,
        'Auto-Submitted': 'auto-generated',
      },
    });
  }

  // -------------------------------------------------------------------- push

  private async deliverPush(event: OutboxEventRecord): Promise<void> {
    const payload = event.payload as unknown as RaisedPayload;
    const recipient = await this.recipient(payload.userId);
    if (!recipient) return;
    if (!channelEnabled(recipient.preferences, payload.type, 'push')) return;

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: recipient.id },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return;

    const failures: { message: string; permanent: boolean }[] = [];

    for (const device of devices) {
      try {
        const outcome = await this.fcm.send({
          deviceToken: device.token,
          title: payload.title,
          body: payload.body,
          // FCM data values must be strings, and the console only needs enough
          // to open the right screen.
          data: { type: payload.type, notificationId: event.aggregateId },
        });

        if (outcome === 'unregistered') {
          await this.prisma.deviceToken.delete({ where: { id: device.id } });
          this.logger.debug('Removed a device token FCM no longer knows');
        }
      } catch (error) {
        // One dead phone must not hold up the others, but the event still has
        // to fail so the ones that did not get it are tried again.
        failures.push({
          message: error instanceof Error ? error.message : String(error),
          permanent: error instanceof PermanentDeliveryError,
        });
      }
    }

    if (failures.length === 0) return;

    const summary = `Push failed for ${failures.length} device(s): ${failures[0].message}`;

    // Permanent only when *every* failure was: one refused project credential
    // and one flaky connection still means the flaky one deserves its retry,
    // and repeating a push somebody already received costs a duplicate buzz.
    throw failures.every((failure) => failure.permanent)
      ? new PermanentDeliveryError(summary)
      : new Error(summary);
  }

  // --------------------------------------------------------------- internals

  private async recipient(userId: string): Promise<{
    id: string;
    email: string;
    name?: string;
    preferences: { type: string; email: boolean; push: boolean }[];
  } | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        employee: { select: { firstNameTh: true, nickname: true } },
        notificationPrefs: { select: { type: true, email: true, push: true } },
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.employee?.nickname ?? user.employee?.firstNameTh ?? undefined,
      preferences: user.notificationPrefs,
    };
  }

  private unsubscribeUrl(userId: string): string {
    const token = createUnsubscribeToken(userId, this.config.auth.accessSecret);
    return `${this.config.delivery.publicWebUrl}/api/v1/notifications/unsubscribe/${token}`;
  }
}
