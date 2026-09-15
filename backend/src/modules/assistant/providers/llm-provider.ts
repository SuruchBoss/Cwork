/**
 * Minimal LLM abstraction.
 *
 * Cwork is provider-agnostic on purpose: an HRIS holds payroll and national
 * ID data, and an operator must be able to choose (or self-host) the model that
 * sees it. Implement this interface and register it in AssistantModule.
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
