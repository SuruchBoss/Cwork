// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  BenefitCategory,
  ExpenseCategory,
  ExpensePaymentMethod,
  PayFrequency,
  PayrollRunType,
} from '@prisma/client';
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
  ValidateNested,
} from 'class-validator';

export class CreatePayrollPeriodDto {
  @ApiPropertyOptional({ description: 'Defaults to YYYY-MM' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year!: number;

  @ApiProperty({ example: 9, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-09-30' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ description: 'Defaults to periodEnd' })
  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @ApiProperty({ example: '2026-09-28' })
  @IsDateString()
  payDate!: string;
}

export class CreatePayrollRunDto {
  @ApiProperty()
  @IsUUID()
  periodId!: string;

  @ApiPropertyOptional({ enum: PayrollRunType, default: PayrollRunType.REGULAR })
  @IsOptional()
  @IsEnum(PayrollRunType)
  type?: PayrollRunType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SetCompensationDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({ example: 45000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseSalary!: number;

  @ApiPropertyOptional({ enum: PayFrequency, default: PayFrequency.MONTHLY })
  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isOvertimeEligible?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isSsoEligible?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Employee provident-fund rate, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(15)
  pvdEmployeeRate?: number;

  @ApiPropertyOptional({ default: 0, description: 'Employer provident-fund rate, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(15)
  pvdEmployerRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateRecurringItemDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  componentId!: string;

  @ApiProperty({ example: 3000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpsertTaxProfileDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  taxYear!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  spouseAllowance?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  childrenCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  childrenBorn2018OrLater?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  parentCareCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  disabledCareCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lifeInsurancePremium?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  healthInsurancePremium?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  parentHealthInsurancePremium?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rmfContribution?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ssfContribution?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mortgageInterest?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  donation?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  educationDonation?: number;
}

export class CreateBenefitPlanDto {
  @ApiProperty({ example: 'HEALTH_STD' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'ประกันสุขภาพกลุ่ม' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: BenefitCategory })
  @IsEnum(BenefitCategory)
  category!: BenefitCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  coverageAmount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  employeeCostPerPeriod?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  employerCostPerPeriod?: number;

  @ApiPropertyOptional({ example: { minServiceMonths: 4, employmentTypes: ['FULL_TIME'] } })
  @IsOptional()
  eligibilityRule?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annualLimit?: number;
}

export class EnrollBenefitDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  planId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dependentIds?: string[];
}

export class UpdateBenefitPlanDto extends PartialType(
  OmitType(CreateBenefitPlanDto, ['code'] as const),
) {
  @ApiPropertyOptional({ description: 'ปิดใช้งานแผน (แผนที่มีคนใช้อยู่จะไม่ถูกลบจริง)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ExpenseClaimItemDto {
  @ApiProperty({ example: '2026-09-12' })
  @IsDateString()
  expenseDate!: string;

  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @ApiProperty({ example: 'ค่าแท็กซี่ไปพบลูกค้า' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: 320.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxInvoiceNo?: string;

  @ApiPropertyOptional({ description: 'Uploaded receipt file id' })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string;
}

export class CreateExpenseClaimDto {
  @ApiProperty({ example: 'ค่าเดินทางพบลูกค้า กันยายน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ enum: ExpensePaymentMethod, default: ExpensePaymentMethod.PAYROLL })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  paymentMethod?: ExpensePaymentMethod;

  @ApiPropertyOptional({ description: 'Draw against a benefit plan’s annual limit' })
  @IsOptional()
  @IsUUID()
  benefitPlanId?: string;

  @ApiProperty({ type: [ExpenseClaimItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseClaimItemDto)
  items!: ExpenseClaimItemDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}

export class DecideExpenseClaimDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum({ APPROVE: 'APPROVE', REJECT: 'REJECT' })
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Approve less than claimed' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approvedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
