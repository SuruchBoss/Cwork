// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ErrorCode } from '../../../core/errors/domain.errors';
import type { LlmProvider, LlmRequest, LlmResponse } from './llm-provider';

/**
 * Used when ASSISTANT_ENABLED=false or no provider is configured.
 *
 * The whole HRIS must work without any AI: this provider makes that explicit
 * rather than leaving the assistant endpoints half-broken.
 */
@Injectable()
export class DisabledProvider implements LlmProvider {
  readonly name = 'disabled';

  isAvailable(): boolean {
    return false;
  }

  async complete(_request: LlmRequest): Promise<LlmResponse> {
    throw new BusinessRuleError(
      ErrorCode.ASSISTANT_DISABLED,
      'The HR assistant is not enabled on this deployment',
    );
  }
}
