// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ScheduleType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Local wall-clock time, `HH:mm` in the organisation's timezone. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HH_MM_MESSAGE = 'ต้องเป็นเวลารูปแบบ HH:mm (เช่น 09:00)';

export class CreateShiftDto {
  @ApiProperty({ example: 'DAY', description: 'รหัสกะ ไม่ซ้ำภายในองค์กร' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'กะกลางวัน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  endTime!: string;

  @ApiPropertyOptional({ default: false, description: 'กะข้ามคืน (เวลาออกอยู่วันถัดไป)' })
  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @ApiPropertyOptional({ default: 5, description: 'ผ่อนผันสายกี่นาทีก่อนถือว่าสาย' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  graceInMinutes?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  graceOutMinutes?: number;

  @ApiPropertyOptional({ default: 480, description: 'ชั่วโมงทำงานมาตรฐาน (นาที) ที่ payroll ใช้' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  standardWorkMinutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFlexible?: boolean;

  @ApiPropertyOptional({ example: '10:00', description: 'ช่วงเวลาหลักสำหรับกะยืดหยุ่น' })
  @IsOptional()
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  coreStartTime?: string;

  @ApiPropertyOptional({ example: '15:00' })
  @IsOptional()
  @Matches(HH_MM, { message: HH_MM_MESSAGE })
  coreEndTime?: string;
}

export class UpdateShiftDto extends PartialType(OmitType(CreateShiftDto, ['code'] as const)) {
  @ApiPropertyOptional({ description: 'ปิดใช้งานกะ (กะที่ถูกอ้างอิงจะไม่ถูกลบจริง)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWorkScheduleDto {
  @ApiProperty({ example: 'MON_FRI' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'จันทร์–ศุกร์' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ enum: ScheduleType, default: ScheduleType.FIXED })
  @IsOptional()
  @IsEnum(ScheduleType)
  type?: ScheduleType;

  @ApiProperty({
    type: [Number],
    example: [1, 2, 3, 4, 5],
    description: 'วันทำงาน ISO 1=จันทร์ … 7=อาทิตย์',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workingDays!: number[];

  @ApiPropertyOptional({ description: 'กะเริ่มต้นของตารางนี้' })
  @IsOptional()
  @IsUUID()
  defaultShiftId?: string;
}

export class UpdateWorkScheduleDto extends PartialType(
  OmitType(CreateWorkScheduleDto, ['code'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateScheduleAssignmentDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ example: '2026-10-01', description: 'YYYY-MM-DD' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'YYYY-MM-DD; เว้นว่าง = ไม่มีกำหนดสิ้นสุด',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class BulkScheduleAssignmentDto {
  @ApiProperty()
  @IsUUID()
  scheduleId!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ type: [String], description: 'พนักงานที่ระบุตรง ๆ' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ description: 'มอบหมายทั้งแผนก' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'มอบหมายทุกคนที่ประจำสถานที่นี้' })
  @IsOptional()
  @IsUUID()
  workLocationId?: string;
}

export class SetRosterDayDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-10-05', description: 'YYYY-MM-DD' })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description: 'กะที่ทำในวันนี้ (สำหรับวันหยุดให้ส่งกะที่ถูกแทนที่พร้อม isDayOff=true)',
  })
  @IsUUID()
  shiftId!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'ทำเครื่องหมายเป็นวันหยุด (แทนที่กะที่ระบุ)',
  })
  @IsOptional()
  @IsBoolean()
  isDayOff?: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class RosterQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'YYYY-MM-DD' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-10-31', description: 'YYYY-MM-DD' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ description: 'กรองเฉพาะแผนกนี้' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'กรองเฉพาะพนักงานคนเดียว' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
