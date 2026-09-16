import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { AttendanceModule } from '../attendance/attendance.module';
import { DocumentsModule } from '../documents/documents.module';
import { LeaveModule } from '../leave/leave.module';
import { OrganizationModule } from '../organization/organization.module';
import { PayrollModule } from '../payroll/payroll.module';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantController, KnowledgeController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { KnowledgeService } from './knowledge.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { DisabledProvider } from './providers/disabled.provider';
import { LLM_PROVIDER, type LlmProvider } from './providers/llm-provider';

/**
 * The assistant composes the other modules' services rather than reaching into
 * their tables, so every rule those modules enforce (balances, approvals,
 * permissions) applies identically whether a request comes from a human or the
 * assistant.
 */
@Module({
  imports: [LeaveModule, AttendanceModule, PayrollModule, DocumentsModule, OrganizationModule],
  controllers: [AssistantController, KnowledgeController],
  providers: [
    AssistantService,
    AssistantToolsService,
    KnowledgeService,
    AnthropicProvider,
    DisabledProvider,
    {
      provide: LLM_PROVIDER,
      inject: [APP_CONFIG, AnthropicProvider, DisabledProvider],
      useFactory: (
        config: RootConfig,
        anthropic: AnthropicProvider,
        disabled: DisabledProvider,
      ): LlmProvider => {
        if (!config.assistant.enabled) return disabled;

        // Exhaustive on purpose. A `?:` falling through to `disabled` is how a
        // provider named in the environment but never implemented turned into a
        // deployment that reported an assistant and refused every question.
        // Validation already rejects an unknown name, so this only fires if the
        // two lists drift apart — and then it fails at boot, not at a question.
        switch (config.assistant.provider) {
          case 'anthropic':
            return anthropic;
          case 'none':
            return disabled;
          default: {
            const unreachable: never = config.assistant.provider;
            throw new Error(`ASSISTANT_PROVIDER="${String(unreachable)}" has no implementation`);
          }
        }
      },
    },
  ],
  exports: [AssistantService, KnowledgeService],
})
export class AssistantModule {}
