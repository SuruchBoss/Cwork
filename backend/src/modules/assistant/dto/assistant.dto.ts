import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssistantChannel, KnowledgeStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ChatDto {
  @ApiProperty({ example: 'ขอลาพักร้อนวันที่ 20-22 ตุลาคม ได้ไหม เหลือกี่วัน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ description: 'Continue an existing conversation' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ enum: AssistantChannel, default: AssistantChannel.WEB })
  @IsOptional()
  @IsEnum(AssistantChannel)
  channel?: AssistantChannel;
}

export class RateMessageDto {
  @ApiProperty({ enum: ['UP', 'DOWN'] })
  @IsIn(['UP', 'DOWN'])
  feedback!: 'UP' | 'DOWN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateKnowledgeDocumentDto {
  @ApiProperty({ example: 'ระเบียบการลาพักร้อน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Plain-text policy content; markdown is fine' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  content!: string;

  @ApiPropertyOptional({ example: 'การลา' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Role keys that may see this document. Empty = everyone.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToRoles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ default: true, description: 'Publish immediately after indexing' })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateKnowledgeDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToRoles?: string[];
}

export class SetKnowledgeStatusDto {
  @ApiProperty({ enum: KnowledgeStatus })
  @IsEnum(KnowledgeStatus)
  status!: KnowledgeStatus;
}
