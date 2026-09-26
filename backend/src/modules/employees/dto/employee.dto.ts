// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  EmployeeStatus,
  EmploymentType,
  Gender,
  MaritalStatus,
  SeparationType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/http/pagination.dto';

export class CreateEmployeeDto {
  @ApiPropertyOptional({ description: 'Auto-generated when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  employeeCode?: string;

  @ApiProperty({ example: 'สมชาย' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstNameTh!: string;

  @ApiProperty({ example: 'ใจดี' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastNameTh!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastNameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @ApiPropertyOptional({ example: '1990-05-12' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional({
    description: 'Thai national ID; stored encrypted',
    example: '1234567890123',
  })
  @IsOptional()
  @Matches(/^\d{13}$/, { message: 'nationalId must be 13 digits' })
  nationalId?: string;

  @ApiPropertyOptional({ description: 'Stored encrypted' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @ApiPropertyOptional({ description: 'Stored encrypted' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  socialSecurityNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  personalEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  workEmail?: string;

  @ApiPropertyOptional({ example: '+66812345678' })
  @IsOptional()
  @IsPhoneNumber('TH')
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiProperty({ example: '2026-01-06' })
  @IsDateString()
  hireDate!: string;

  @ApiPropertyOptional({ example: '2026-05-05' })
  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @ApiPropertyOptional({ description: 'Create a login and send an invitation' })
  @IsOptional()
  @IsBoolean()
  createUserAccount?: boolean;
}

export class UpdateEmployeeDto extends PartialType(
  OmitType(CreateEmployeeDto, ['employeeCode', 'createUserAccount'] as const),
) {
  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;
}

/** What an employee may change about themselves, without HR involvement. */
export class UpdateOwnProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber('TH')
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;
}

export class EmployeeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EmployeeStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(EmployeeStatus, { each: true })
  status?: EmployeeStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
}

export class CreateResignationDto {
  @ApiPropertyOptional({ enum: SeparationType, default: SeparationType.RESIGNATION })
  @IsOptional()
  @IsEnum(SeparationType)
  separationType?: SeparationType;

  @ApiProperty({ example: '2026-10-31' })
  @IsDateString()
  requestedLastWorkingDate!: string;

  @ApiPropertyOptional({ example: 'CAREER_GROWTH' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reasonCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class DecideResignationDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum({ APPROVE: 'APPROVE', REJECT: 'REJECT' })
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Negotiated final working day' })
  @IsOptional()
  @IsDateString()
  agreedLastWorkingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateOffboardingTaskDto {
  @ApiProperty({ example: 'คืนโน้ตบุ๊กและบัตรพนักงาน' })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'IT' })
  @IsString()
  @MaxLength(60)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
