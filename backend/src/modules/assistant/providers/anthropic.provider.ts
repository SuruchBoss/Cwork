// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../core/config/config.token';
import type { RootConfig } from '../../../core/config/configuration';
import { BusinessRuleError } from '../../../core/errors/domain.errors';
import type { LlmContentBlock, LlmProvider, LlmRequest, LlmResponse } from './llm-provider';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic | null;

  // Enabled-with-no-key is refused at boot, so the client is null only when the
  // assistant is off — there is nothing left here to warn about.
  constructor(@Inject(APP_CONFIG) private readonly config: RootConfig) {
    this.client = config.assistant.apiKey
      ? new Anthropic({ apiKey: config.assistant.apiKey })
      : null;
  }

  isAvailable(): boolean {
    return this.config.assistant.enabled && this.client !== null;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.client) {
      throw new BusinessRuleError(
        'ASSISTANT_NOT_CONFIGURED',
        'The assistant provider is not configured (missing ANTHROPIC_API_KEY)',
      );
    }

    const response = await this.client.messages.create({
      model: this.config.assistant.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      system: request.system,
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content.map(toProviderBlock),
      })),
    });

    return {
      content: response.content
        .map(fromProviderBlock)
        .filter((b): b is LlmContentBlock => b !== null),
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}

function toProviderBlock(block: LlmContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError,
      };
  }
}

function fromProviderBlock(block: Anthropic.ContentBlock): LlmContentBlock | null {
  if (block.type === 'text') return { type: 'text', text: block.text };
  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: (block.input ?? {}) as Record<string, unknown>,
    };
  }
  // Thinking/redacted blocks carry no content the HRIS needs to persist.
  return null;
}

function mapStopReason(reason: string | null): LlmResponse['stopReason'] {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'other';
  }
}
