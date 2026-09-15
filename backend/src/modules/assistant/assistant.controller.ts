import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, KnowledgeStatus } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { AssistantService } from './assistant.service';
import {
  ChatDto,
  CreateKnowledgeDocumentDto,
  RateMessageDto,
  SetKnowledgeStatusDto,
  UpdateKnowledgeDocumentDto,
} from './dto/assistant.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('HR Assistant')
@ApiBearerAuth()
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the assistant is enabled on this deployment' })
  status() {
    return { enabled: this.assistant.isEnabled() };
  }

  @Post('chat')
  @RequirePermissions(Permission.ASSISTANT_USE)
  // Tight limit: each turn can trigger several model calls and tool executions.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ask the HR assistant',
    description:
      'Answers policy questions from the knowledge base and can file leave and document requests on the user’s behalf, always after an explicit confirmation.',
  })
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChatDto) {
    return this.assistant.chat(user, dto.message, {
      conversationId: dto.conversationId,
      channel: dto.channel,
    });
  }

  @Get('conversations')
  @RequirePermissions(Permission.ASSISTANT_USE)
  @ApiOperation({ summary: 'My assistant conversations' })
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.listConversations(user);
  }

  @Get('conversations/:id')
  @RequirePermissions(Permission.ASSISTANT_USE)
  @ApiOperation({ summary: 'Conversation transcript' })
  getConversation(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.getConversation(user, id);
  }

  @Delete('conversations/:id')
  @RequirePermissions(Permission.ASSISTANT_USE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a conversation' })
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.archiveConversation(user, id);
  }

  @Post('messages/:id/feedback')
  @RequirePermissions(Permission.ASSISTANT_USE)
  @ApiOperation({ summary: 'Rate an assistant answer' })
  rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateMessageDto,
  ) {
    return this.assistant.rateMessage(user, id, dto.feedback, dto.note);
  }

  @Get('flagged')
  @RequirePermissions(Permission.ASSISTANT_CONVERSATION_AUDIT)
  @ApiOperation({
    summary: 'Answers that were rated down or blocked',
    description: 'The review queue HR works through to improve the knowledge base.',
  })
  flagged(@CurrentUser() user: AuthenticatedUser) {
    return this.assistant.listFlaggedConversations(user);
  }
}

@ApiTags('HR Knowledge Base')
@ApiBearerAuth()
@Controller('assistant/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @ApiOperation({ summary: 'List HR policy documents' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: KnowledgeStatus) {
    return this.knowledge.listDocuments(user.organizationId, status);
  }

  @Get('search')
  @RequirePermissions(Permission.ASSISTANT_USE)
  @ApiOperation({ summary: 'Search HR policies directly (same retrieval the assistant uses)' })
  search(@CurrentUser() user: AuthenticatedUser, @Query('q') q: string) {
    return this.knowledge.search(user.organizationId, q ?? '', user.roles, 8);
  }

  @Get(':id')
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @ApiOperation({ summary: 'Policy document with its indexed chunks' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.getDocument(user.organizationId, id);
  }

  @Post()
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Add a policy document and index it' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKnowledgeDocumentDto) {
    return this.knowledge.createDocument(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Update a policy document (re-indexes when the text changes)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
  ) {
    return this.knowledge.updateDocument(user.organizationId, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Publish or archive a policy document' })
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetKnowledgeStatusDto,
  ) {
    return this.knowledge.setStatus(user.organizationId, id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions(Permission.ASSISTANT_KNOWLEDGE_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited({ action: AuditAction.DELETE, entityType: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Archive a policy document' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.deleteDocument(user.organizationId, id);
  }
}
