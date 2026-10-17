// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The statuses a day can be filtered by in the review list. */
export const SCANNER_STATUS_FILTERS = [
  'WAITING',
  'COUNTED',
  'DECIDED_USE',
  'DECIDED_IGNORE',
  'NO_PUNCH',
  'UNMAPPED',
  'LOCKED',
  'ALL',
] as const;
export type ScannerStatusFilter = (typeof SCANNER_STATUS_FILTERS)[number];

export class ScannerDaysQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-01',
    description: 'First day; defaults to the start of the latest import',
  })
  @IsOptional()
  @Matches(DATE, { message: 'from must be a date as yyyy-mm-dd' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Last day; defaults to the end of the latest import',
  })
  @IsOptional()
  @Matches(DATE, { message: 'to must be a date as yyyy-mm-dd' })
  to?: string;

  @ApiPropertyOptional({ enum: SCANNER_STATUS_FILTERS, default: 'WAITING' })
  @IsOptional()
  @IsIn(SCANNER_STATUS_FILTERS)
  status?: ScannerStatusFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'A scanner user number, exactly as the scanner writes it' })
  @IsOptional()
  @Matches(/^\d{1,12}$/, { message: 'scannerNumber must be digits' })
  scannerNumber?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 100, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export enum ScannerDecisionActionDto {
  USE = 'USE',
  IGNORE = 'IGNORE',
}

export class DecideScannerDayDto {
  @ApiProperty({ enum: ScannerDecisionActionDto })
  @IsEnum(ScannerDecisionActionDto)
  action!: ScannerDecisionActionDto;

  @ApiPropertyOptional({
    example: '08:01',
    description: "One of the day's times, used as the clock-in",
  })
  @IsOptional()
  @Matches(TIME, { message: 'clockIn must be a time as HH:mm' })
  clockIn?: string;

  @ApiPropertyOptional({
    example: '17:05',
    description: "One of the day's times, used as the clock-out",
  })
  @IsOptional()
  @Matches(TIME, { message: 'clockOut must be a time as HH:mm' })
  clockOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BindScannerNumberDto {
  @ApiProperty({ description: 'A scanner user number, exactly as the scanner writes it' })
  @Matches(/^\d{1,12}$/, { message: 'scannerNumber must be digits' })
  scannerNumber!: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;
}
