import { Inject, Injectable, Logger } from '@nestjs/common';
import { AssistantChannel, AssistantMessageRole, Prisma } from '@prisma/client';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { BusinessRuleError, ErrorCode, NotFoundError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { formatDateOnly, workDateFor } from '../../core/utils/date.util';
import { OrganizationService } from '../organization/organization.service';
import { AssistantToolsService } from './assistant-tools.service';
import {
  buildSystemPrompt,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_ITERATIONS,
  redactSensitive,
  screenUserMessage,
  type AssistantContext,
} from './domain/guardrails';
import { ASSISTANT_TOOLS } from './domain/tool-definitions';
import { KnowledgeService } from './knowledge.service';
import {
  LLM_PROVIDER,
  textOf,
  toolUsesOf,
  type LlmContentBlock,
  type LlmMessage,
  type LlmProvider,
} from './providers/llm-provider';

export interface ChatResult {
  conversationId: string;
  messageId: string;
  reply: string;
  citations: Array<{ documentId: string; title: string; chunkIndex: number }>;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly prisma: PrismaService,
    private readonly tools: AssistantToolsService,
    private readonly knowledge: KnowledgeService,
    private readonly organization: OrganizationService,
  ) {}

  isEnabled(): boolean {
    return this.llm.isAvailable();
  }

  /**
   * One conversational turn.
   *
   * The loop is: retrieve policy context → call the model → run any tools it
   * asks for → feed results back → repeat until it answers or hits
   * MAX_TOOL_ITERATIONS. Bounding the loop matters: a model that keeps calling
   * tools would otherwise burn budget indefinitely.
   */
  async chat(
    user: AuthenticatedUser,
    message: string,
    options: { conversationId?: string; channel?: AssistantChannel } = {},
  ): Promise<ChatResult> {
    if (!this.llm.isAvailable()) {
      throw new BusinessRuleError(
        ErrorCode.ASSISTANT_DISABLED,
        'The HR assistant is not enabled on this deployment',
      );
    }

    await this.assertWithinQuota(user);

    const conversation = await this.resolveConversation(user, options);

    const screening = screenUserMessage(message);
    if (!screening.allowed) {
      // The model is never called for these: the reply is fixed, and the turn is
      // recorded so HR can follow up with a human.
      await this.persistTurn(conversation.id, message, screening.replacementReply!, {
        blockedReason: screening.reason,
      });
      return {
        conversationId: conversation.id,
        messageId: '',
        reply: screening.replacementReply!,
        citations: [],
        toolsUsed: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const [context, knowledgeBlock] = await Promise.all([
      this.buildContext(user),
      this.buildKnowledgeBlock(user, message),
    ]);

    const system = buildSystemPrompt(context, knowledgeBlock.text);
    const history = await this.loadHistory(conversation.id);

    const messages: LlmMessage[] = [
      ...history,
      { role: 'user', content: [{ type: 'text', text: message }] },
    ];

    const citations = [...knowledgeBlock.citations];
    const toolsUsed: string[] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    let reply = '';
    let model = this.config.assistant.model;
    const startedAt = Date.now();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await this.llm.complete({
        system,
        messages,
        tools: ASSISTANT_TOOLS,
        maxTokens: this.config.assistant.maxTokens,
      });

      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      model = response.model;

      const toolUses = toolUsesOf(response.content);

      if (toolUses.length === 0) {
        reply = textOf(response.content);
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const results: LlmContentBlock[] = [];
      for (const toolUse of toolUses) {
        toolsUsed.push(toolUse.name);
        const result = await this.tools.execute(user, toolUse.name, toolUse.input);
        if (result.citations) citations.push(...result.citations);

        results.push({
          type: 'tool_result',
          toolUseId: toolUse.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
          isError: !result.ok,
        });
      }

      messages.push({ role: 'user', content: results });

      // Last allowed iteration: take whatever text the model produced so the
      // user gets an answer rather than silence.
      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        this.logger.warn(
          `Assistant hit the tool-iteration limit for conversation ${conversation.id}; answering with what it has`,
        );
        reply =
          textOf(response.content) || 'ขออภัย ฉันยังหาคำตอบให้ไม่ได้ กรุณาติดต่อฝ่ายบุคคลโดยตรง';
      }
    }

    if (!reply) {
      reply = 'ขออภัย ฉันยังหาคำตอบให้ไม่ได้ กรุณาติดต่อฝ่ายบุคคลโดยตรง';
    }

    const safeReply = redactSensitive(reply);
    const assistantMessage = await this.persistTurn(conversation.id, message, safeReply, {
      citations: dedupeCitations(citations),
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      toolsUsed,
    });

    await this.recordUsage(user, usage, toolsUsed.length);

    return {
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      reply: safeReply,
      citations: dedupeCitations(citations),
      toolsUsed,
      usage,
    };
  }

  // ------------------------------------------------------------- conversations

  listConversations(user: AuthenticatedUser, limit = 30) {
    return this.prisma.assistantConversation.findMany({
      where: { userId: user.userId, isArchived: false },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: { id: true, title: true, channel: true, lastMessageAt: true, createdAt: true },
    });
  }

  async getConversation(user: AuthenticatedUser, id: string) {
    const conversation = await this.prisma.assistantConversation.findFirst({
      where: { id, userId: user.userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            citations: true,
            toolName: true,
            feedback: true,
            createdAt: true,
          },
        },
      },
    });
    if (!conversation) throw new NotFoundError('AssistantConversation', id);

    // Tool turns are internal plumbing; the transcript shows the dialogue.
    return {
      ...conversation,
      messages: conversation.messages.filter((m) => m.role !== AssistantMessageRole.TOOL),
    };
  }

  async archiveConversation(user: AuthenticatedUser, id: string): Promise<void> {
    const result = await this.prisma.assistantConversation.updateMany({
      where: { id, userId: user.userId },
      data: { isArchived: true },
    });
    if (result.count === 0) throw new NotFoundError('AssistantConversation', id);
  }

  async rateMessage(
    user: AuthenticatedUser,
    messageId: string,
    feedback: 'UP' | 'DOWN',
    note?: string,
  ) {
    const message = await this.prisma.assistantMessage.findFirst({
      where: { id: messageId, conversation: { userId: user.userId } },
    });
    if (!message) throw new NotFoundError('AssistantMessage', messageId);

    return this.prisma.assistantMessage.update({
      where: { id: messageId },
      data: { feedback, feedbackNote: note },
    });
  }

  /**
   * Conversations flagged for review: thumbs-down, guardrail blocks, or tool
   * errors. This is the queue HR works through to improve the knowledge base.
   */
  async listFlaggedConversations(user: AuthenticatedUser, limit = 50) {
    if (!user.permissions.includes(Permission.ASSISTANT_CONVERSATION_AUDIT)) {
      throw new BusinessRuleError('ACCESS_DENIED', 'You cannot audit assistant conversations');
    }

    return this.prisma.assistantMessage.findMany({
      where: {
        conversation: { organizationId: user.organizationId },
        OR: [{ feedback: 'DOWN' }, { blockedReason: { not: null } }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        feedback: true,
        feedbackNote: true,
        blockedReason: true,
        createdAt: true,
        conversation: {
          select: {
            id: true,
            title: true,
            user: {
              select: {
                email: true,
                employee: { select: { firstNameTh: true, lastNameTh: true } },
              },
            },
          },
        },
      },
    });
  }

  // ------------------------------------------------------------------ internals

  private async resolveConversation(
    user: AuthenticatedUser,
    options: { conversationId?: string; channel?: AssistantChannel },
  ) {
    if (options.conversationId) {
      const existing = await this.prisma.assistantConversation.findFirst({
        where: { id: options.conversationId, userId: user.userId },
      });
      if (!existing) throw new NotFoundError('AssistantConversation', options.conversationId);
      return existing;
    }

    return this.prisma.assistantConversation.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        channel: options.channel ?? AssistantChannel.WEB,
      },
    });
  }

  private async buildContext(user: AuthenticatedUser): Promise<AssistantContext> {
    const [organization, employee] = await Promise.all([
      this.organization.getOrganization(user.organizationId),
      user.employeeId
        ? this.prisma.employee.findUnique({
            where: { id: user.employeeId },
            select: {
              employeeCode: true,
              firstNameTh: true,
              lastNameTh: true,
              hireDate: true,
              position: { select: { title: true } },
              department: { select: { name: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      employeeName: employee ? `${employee.firstNameTh} ${employee.lastNameTh}` : user.email,
      employeeCode: employee?.employeeCode ?? '-',
      position: employee?.position?.title ?? null,
      department: employee?.department?.name ?? null,
      hireDate: employee ? formatDateOnly(employee.hireDate) : '-',
      isManager: user.permissions.includes(Permission.APPROVAL_ACT),
      organizationName: organization.name,
      locale: user.roles.includes('EN') ? 'en' : organization.defaultLocale,
      today: formatDateOnly(workDateFor(new Date(), organization.timezone)),
      timezone: organization.timezone,
    };
  }

  /**
   * Pre-fetches likely-relevant policy so simple questions are answered in one
   * model call instead of a retrieval round trip.
   */
  private async buildKnowledgeBlock(user: AuthenticatedUser, message: string) {
    const hits = await this.knowledge.search(user.organizationId, message, user.roles, 4);

    return {
      text: hits
        .map((hit) => `## ${hit.title}${hit.category ? ` (${hit.category})` : ''}\n${hit.content}`)
        .join('\n\n---\n\n'),
      citations: hits.map((hit) => ({
        documentId: hit.documentId,
        title: hit.title,
        chunkIndex: hit.chunkIndex,
      })),
    };
  }

  private async loadHistory(conversationId: string): Promise<LlmMessage[]> {
    const messages = await this.prisma.assistantMessage.findMany({
      where: {
        conversationId,
        role: { in: [AssistantMessageRole.USER, AssistantMessageRole.ASSISTANT] },
        blockedReason: null,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });

    return messages.reverse().map((m) => ({
      role: m.role === AssistantMessageRole.USER ? ('user' as const) : ('assistant' as const),
      content: [{ type: 'text' as const, text: m.content }],
    }));
  }

  private async persistTurn(
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    meta: {
      citations?: Array<{ documentId: string; title: string; chunkIndex: number }>;
      model?: string;
      usage?: { inputTokens: number; outputTokens: number };
      latencyMs?: number;
      toolsUsed?: string[];
      blockedReason?: string;
    } = {},
  ) {
    const [, assistantMessage] = await this.prisma.$transaction([
      this.prisma.assistantMessage.create({
        data: { conversationId, role: AssistantMessageRole.USER, content: userMessage },
      }),
      this.prisma.assistantMessage.create({
        data: {
          conversationId,
          role: AssistantMessageRole.ASSISTANT,
          content: assistantReply,
          citations: (meta.citations ?? []) as unknown as Prisma.InputJsonValue,
          model: meta.model,
          inputTokens: meta.usage?.inputTokens,
          outputTokens: meta.usage?.outputTokens,
          latencyMs: meta.latencyMs,
          toolName: meta.toolsUsed?.length ? meta.toolsUsed.join(',') : null,
          blockedReason: meta.blockedReason,
        },
      }),
      this.prisma.assistantConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          // First user message doubles as the conversation title.
          title: userMessage.slice(0, 80),
        },
      }),
    ]);

    return assistantMessage;
  }

  /** Per-user daily caps, to bound both cost and abuse. */
  private async assertWithinQuota(user: AuthenticatedUser): Promise<void> {
    const organization = await this.organization.getOrganization(user.organizationId);
    const usageDate = workDateFor(new Date(), organization.timezone);

    const counter = await this.prisma.assistantUsageCounter.findUnique({
      where: { userId_usageDate: { userId: user.userId, usageDate } },
    });
    if (!counter) return;

    const { dailyMessageLimit, dailyTokenLimit } = this.config.assistant;
    const totalTokens = counter.inputTokens + counter.outputTokens;

    if (counter.messageCount >= dailyMessageLimit) {
      throw new BusinessRuleError(
        ErrorCode.ASSISTANT_QUOTA_EXCEEDED,
        `คุณใช้ผู้ช่วย HR ครบ ${dailyMessageLimit} ข้อความสำหรับวันนี้แล้ว`,
      );
    }
    if (totalTokens >= dailyTokenLimit) {
      throw new BusinessRuleError(
        ErrorCode.ASSISTANT_QUOTA_EXCEEDED,
        'คุณใช้โควตาผู้ช่วย HR สำหรับวันนี้ครบแล้ว',
      );
    }
  }

  private async recordUsage(
    user: AuthenticatedUser,
    usage: { inputTokens: number; outputTokens: number },
    toolCalls: number,
  ): Promise<void> {
    const organization = await this.organization.getOrganization(user.organizationId);
    const usageDate = workDateFor(new Date(), organization.timezone);

    await this.prisma.assistantUsageCounter.upsert({
      where: { userId_usageDate: { userId: user.userId, usageDate } },
      create: {
        organizationId: user.organizationId,
        userId: user.userId,
        usageDate,
        messageCount: 1,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        toolCallCount: toolCalls,
      },
      update: {
        messageCount: { increment: 1 },
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
        toolCallCount: { increment: toolCalls },
      },
    });
  }
}

function dedupeCitations(
  citations: Array<{ documentId: string; title: string; chunkIndex: number }>,
): Array<{ documentId: string; title: string; chunkIndex: number }> {
  const seen = new Map<string, { documentId: string; title: string; chunkIndex: number }>();
  for (const citation of citations) {
    seen.set(`${citation.documentId}:${citation.chunkIndex}`, citation);
  }
  return [...seen.values()];
}
