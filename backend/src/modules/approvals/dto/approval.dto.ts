// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalEntityType, ApprovalTaskStatus, ApproverType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ApprovalDecisionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum({ APPROVE: 'APPROVE', REJECT: 'REJECT' })
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Required when rejecting, so the requester knows why' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ApprovalTaskQueryDto {
  @ApiPropertyOptional({ enum: ApprovalTaskStatus, default: ApprovalTaskStatus.PENDING })
  @IsOptional()
  @IsEnum(ApprovalTaskStatus)
  status?: ApprovalTaskStatus;
}

export class ApprovalPolicyStepDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex!: number;

  @ApiProperty({ enum: ApproverType })
  @IsEnum(ApproverType)
  approverType!: ApproverType;

  @ApiPropertyOptional({ default: 1, description: 'Levels up the reporting line for LINE_MANAGER' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelsUp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  specificUserId?: string;

  @ApiPropertyOptional({ default: true, description: 'Any one approver decides, vs. all of them' })
  @IsOptional()
  @IsBoolean()
  anyOf?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @ApiPropertyOptional({ description: 'Hours before this step is flagged as overdue' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slaHours?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipIfSelf?: boolean;
}

export class CreateApprovalPolicyDto {
  @ApiProperty({ enum: ApprovalEntityType })
  @IsEnum(ApprovalEntityType)
  entityType!: ApprovalEntityType;

  @ApiProperty({ example: 'Leave over 3 days' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Field conditions, e.g. { "totalDays": { "gte": 3 } }',
    example: { totalDays: { gte: 3 } },
  })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({
    default: 0,
    description: 'Higher priority wins when several policies match',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiProperty({ type: [ApprovalPolicyStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalPolicyStepDto)
  steps!: ApprovalPolicyStepDto[];
}
