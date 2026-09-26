// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KpiCategory, KpiDirection, ReviewCycleType, ReviewType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewCycleDto {
  @ApiProperty({ example: 'FY2026-ANNUAL' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'ประเมินผลประจำปี 2026' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ enum: ReviewCycleType })
  @IsOptional()
  @IsEnum(ReviewCycleType)
  type?: ReviewCycleType;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  goalSettingDue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  selfReviewDue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  managerReviewDue?: string;

  @ApiPropertyOptional({ default: 70, description: 'Must total 100 with competencyWeight' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  kpiWeight?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  competencyWeight?: number;

  @ApiPropertyOptional({
    example: [
      { grade: 'A', min: 90, label: 'Outstanding' },
      { grade: 'B', min: 75, label: 'Exceeds' },
      { grade: 'C', min: 60, label: 'Meets' },
      { grade: 'D', min: 0, label: 'Below' },
    ],
  })
  @IsOptional()
  @IsArray()
  ratingScale?: Array<{ grade: string; min: number; label?: string }>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeSelfReview?: boolean;
}

export class CreateKpiGoalDto {
  @ApiProperty()
  @IsUUID()
  cycleId!: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: 'เพิ่มยอดขายภูมิภาคเหนือ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: KpiCategory })
  @IsOptional()
  @IsEnum(KpiCategory)
  category?: KpiCategory;

  @ApiProperty({ example: 40, description: 'All goals in a cycle must total 100' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight!: number;

  @ApiPropertyOptional({ example: 'บาท' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @ApiPropertyOptional({ enum: KpiDirection })
  @IsOptional()
  @IsEnum(KpiDirection)
  direction?: KpiDirection;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  baselineValue?: number;

  @ApiProperty({ example: 5000000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  targetValue!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  stretchValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class KpiCheckInDto {
  @ApiProperty({ example: 3200000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evidenceFileIds?: string[];
}

export class SubmitReviewDto {
  @ApiProperty()
  @IsUUID()
  cycleId!: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ enum: ReviewType })
  @IsEnum(ReviewType)
  type!: ReviewType;

  @ApiPropertyOptional({
    example: [{ competency: 'Teamwork', weight: 25, score: 4, comment: '…' }],
  })
  @IsOptional()
  @IsArray()
  competencyScores?: Array<{ competency: string; weight: number; score: number; comment?: string }>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  improvements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  developmentPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  managerComment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  employeeComment?: string;
}

export class CalibrateReviewDto {
  @ApiProperty({ example: 'B' })
  @IsString()
  @MaxLength(8)
  calibratedGrade!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
