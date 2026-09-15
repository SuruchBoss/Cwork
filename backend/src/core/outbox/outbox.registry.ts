import { Injectable, Logger } from '@nestjs/common';

export interface OutboxEventRecord {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
}

export type OutboxHandler = (event: OutboxEventRecord) => Promise<void>;

/**
 * Who wants to hear about what.
 *
 * Feature modules register in `onModuleInit`, so the dispatcher never imports
 * them — the same trick `ApprovalOutcomeRegistry` uses, for the same reason.
 *
 * Several handlers may take the same event type: an approval falling due is an
 * email *and* a push, and neither of them is the other's business. They are
 * dispatched together and judged together — see `OutboxDispatcher`.
 */
@Injectable()
export class OutboxRegistry {
  private readonly logger = new Logger(OutboxRegistry.name);
  private readonly handlers = new Map<string, OutboxHandler[]>();

  register(eventType: string, handler: OutboxHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);
    this.logger.log(`Handler registered for ${eventType} (${existing.length + 1} total)`);
  }

  handlersFor(eventType: string): OutboxHandler[] {
    return this.handlers.get(eventType) ?? [];
  }

  /** Every event type somebody is listening for. For the boot log. */
  subscribedTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
