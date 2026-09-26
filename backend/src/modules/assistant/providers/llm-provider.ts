// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal LLM abstraction.
 *
 * This is a seam, not a capability: two implementations ship, `AnthropicProvider`
 * and `DisabledProvider`, and `ASSISTANT_PROVIDER` accepts exactly those two
 * names. An operator who needs the model that sees payroll and national ID data
 * to be one they run has to write an implementation of this interface and
 * register it in `AssistantModule` — CW-018 tracks doing that for the
 * OpenAI-compatible APIs that Ollama, vLLM and LiteLLM expose.
 *
 * Until then nothing here claims otherwise. A provider name the factory cannot
 * honour is rejected at boot rather than quietly resolving to the disabled one.
 */

export interface LlmTextBlock {
  type: 'text';
  text: string;
}

export interface LlmToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContentBlock[];
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  maxTokens: number;
  temperature?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  content: LlmContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: LlmUsage;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  isAvailable(): boolean;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** Extracts the plain-text answer from a response, ignoring tool blocks. */
export function textOf(content: LlmContentBlock[]): string {
  return content
    .filter((block): block is LlmTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export function toolUsesOf(content: LlmContentBlock[]): LlmToolUseBlock[] {
  return content.filter((block): block is LlmToolUseBlock => block.type === 'tool_use');
}
