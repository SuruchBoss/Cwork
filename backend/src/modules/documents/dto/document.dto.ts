// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentRequestType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDocumentRequestDto {
  @ApiProperty({ enum: DocumentRequestType })
  @IsEnum(DocumentRequestType)
  type!: DocumentRequestType;

  @ApiPropertyOptional({ enum: ['th', 'en'], default: 'th' })
  @IsOptional()
  @IsIn(['th', 'en'])
  language?: string;

  @ApiPropertyOptional({ example: 'ยื่นขอวีซ่าประเทศญี่ปุ่น' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @ApiPropertyOptional({ example: 'สถานทูตญี่ปุ่นประจำประเทศไทย' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressedTo?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Disclosing salary is opt-in per request and is audited',
  })
  @IsOptional()
  @IsBoolean()
  includeSalary?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  copies?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  needByDate?: string;
}

export class IssueDocumentDto {
  @ApiPropertyOptional({ description: 'Generated or uploaded document file id' })
  @IsOptional()
  @IsString()
  fileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectDocumentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
