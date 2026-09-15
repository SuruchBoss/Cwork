import { Injectable, Logger } from '@nestjs/common';
import type { ApprovalEntityType, ApprovalStatus } from '@prisma/client';

export interface ApprovalOutcome {
  instanceId: string;
  organizationId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  status: ApprovalStatus;
  decidedByUserId?: string;
  comment?: string;
}

export type ApprovalOutcomeHandler = (outcome: ApprovalOutcome) => Promise<void>;

/**
 * Lets feature modules react when their entity finishes approval without the
 * approvals module importing them (which would create an import cycle).
 * Each module registers itself in `onModuleInit`.
 */
@Injectable()
export class ApprovalOutcomeRegistry {
  private readonly logger = new Logger(ApprovalOutcomeRegistry.name);
  private readonly handlers = new Map<ApprovalEntityType, ApprovalOutcomeHandler>();

  register(entityType: ApprovalEntityType, handler: ApprovalOutcomeHandler): void {
    if (this.handlers.has(entityType)) {
      this.logger.warn(`Replacing existing approval outcome handler for ${entityType}`);
    }
    this.handlers.set(entityType, handler);
  }

  async dispatch(outcome: ApprovalOutcome): Promise<void> {
    const handler = this.handlers.get(outcome.entityType);
    if (!handler) {
      this.logger.warn(`No approval outcome handler registered for ${outcome.entityType}`);
      return;
    }
    await handler(outcome);
  }
}
