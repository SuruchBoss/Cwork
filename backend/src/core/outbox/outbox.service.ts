// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface OutboxEventInput {
  organizationId: string;
  /** Dot-separated and past tense, e.g. `notification.raised`. */
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

/**
 * Records a domain event in the same transaction as the change that caused it.
 *
 * This is the half of the outbox pattern that makes the other half worth
 * having. Writing a row and then sending a message are two operations that can
 * only be made atomic by making them the same operation: both go into
 * PostgreSQL, in one transaction, and the dispatcher turns the second one into
 * a message afterwards. A transaction that rolls back takes its events with it,
 * and a process that dies after committing leaves the events behind to be
 * relayed by whoever is alive next.
 *
 * Hence the `tx` parameter, which is not a convenience: an event written on the
 * ordinary client is a plain dual write with extra steps, and there would be no
 * way to tell the difference by reading the call site.
 */
@Injectable()
export class OutboxService {
  /** Records one event. Must be called with the caller's transaction client. */
  async record(tx: Prisma.TransactionClient, event: OutboxEventInput): Promise<void> {
    await this.recordMany(tx, [event]);
  }

  /** Records several events, in one statement. */
  async recordMany(tx: Prisma.TransactionClient, events: OutboxEventInput[]): Promise<void> {
    if (events.length === 0) return;

    await tx.outboxEvent.createMany({
      data: events.map((event) => ({
        organizationId: event.organizationId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Prisma.InputJsonValue,
      })),
    });
  }
}
