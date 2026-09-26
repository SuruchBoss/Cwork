// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  DayPortion,
  Gender,
  LeaveAccrualMethod,
  LeaveRequestStatus,
  LeaveUnit,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/http/pagination.dto';

export class CreateLeaveTypeDto {
  @ApiProperty({ example: 'ANNUAL' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  code!: string;

  @ApiProperty({ example: 'ลาพักร้อน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Annual leave' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameEn?: string;

  @ApiPropertyOptional({ enum: LeaveUnit, default: LeaveUnit.DAY })
  @IsOptional()
  @IsEnum(LeaveUnit)
  unit?: LeaveUnit;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: 'Counts toward statutory minimums in compliance reports' })
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  defaultQuota?: number;

  @ApiPropertyOptional({ enum: LeaveAccrualMethod })
  @IsOptional()
  @IsEnum(LeaveAccrualMethod)
  accrualMethod?: LeaveAccrualMethod;

  @ApiPropertyOptional({
    description: 'Quota by years of service',
    example: [
      { years: 0, quota: 6 },
      { years: 3, quota: 10 },
    ],
  })
  @IsOptional()
  @IsArray()
  seniorityTiers?: Array<{ years: number; quota: number }>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowHalfDay?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowHourly?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresAttachment?: boolean;

  @ApiPropertyOptional({ description: 'Attachment only required beyond this many days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  attachmentRequiredAfterDays?: number;

  @ApiPropertyOptional({ default: 0, description: 'Minimum days of advance notice' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minNoticeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPerYear?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  carryOverMaxDays?: number;

  @ApiPropertyOptional({
    enum: Gender,
    description: 'Restrict to one gender (maternity/ordination)',
  })
  @IsOptional()
  @IsEnum(Gender)
  genderRestriction?: Gender;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minServiceDays?: number;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  colorHex?: string;
}

export class UpdateLeaveTypeDto extends PartialType(CreateLeaveTypeDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLeaveRequestDto {
  @ApiProperty()
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ example: '2026-10-05' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-10-07' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ enum: DayPortion, default: DayPortion.FULL })
  @IsOptional()
  @IsEnum(DayPortion)
  startPortion?: DayPortion;

  @ApiPropertyOptional({ enum: DayPortion, default: DayPortion.FULL })
  @IsOptional()
  @IsEnum(DayPortion)
  endPortion?: DayPortion;

  @ApiPropertyOptional({ description: 'Required when startPortion is HOURS' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(24)
  requestedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason?: string;

  @ApiPropertyOptional({ description: 'Where you can be reached while away' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Colleague covering your work' })
  @IsOptional()
  @IsUUID()
  backupEmployeeId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Uploaded file ids (medical certificate…)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({ description: 'Save without submitting for approval' })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class CancelLeaveRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class LeaveRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeaveRequestStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(LeaveRequestStatus, { each: true })
  status?: LeaveRequestStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Limit to the caller’s direct reports' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  teamOnly?: boolean;
}

export class AdjustLeaveBalanceDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @ApiProperty({ description: 'Signed: positive grants days, negative deducts them', example: 1.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

export class LeaveBalanceDto {
  @ApiProperty() leaveTypeId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() colorHex!: string;
  @ApiProperty() unit!: LeaveUnit;
  @ApiProperty() year!: number;
  @ApiProperty() granted!: number;
  @ApiProperty() carriedOver!: number;
  @ApiProperty() adjusted!: number;
  @ApiProperty() used!: number;
  @ApiProperty() pending!: number;
  @ApiProperty() available!: number;
  @ApiProperty() isPaid!: boolean;
}
