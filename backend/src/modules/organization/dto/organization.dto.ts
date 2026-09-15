import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

export class CreateDepartmentDto {
  @ApiProperty({ example: 'ENG' })
  @IsString()
  @Matches(CODE_PATTERN, { message: 'code must be uppercase alphanumeric with - or _' })
  code!: string;

  @ApiProperty({ example: 'ฝ่ายวิศวกรรม' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  costCenter?: string;

  @ApiPropertyOptional({ description: 'Parent department for the org tree' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  headEmployeeId?: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePositionDto {
  @ApiProperty({ example: 'SWE2' })
  @IsString()
  @Matches(CODE_PATTERN)
  code!: string;

  @ApiProperty({ example: 'วิศวกรซอฟต์แวร์ อาวุโส' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 9, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9)
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWorkLocationDto {
  @ApiProperty({ example: 'HQ' })
  @IsString()
  @Matches(CODE_PATTERN)
  code!: string;

  @ApiProperty({ example: 'สำนักงานใหญ่' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

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

  @ApiPropertyOptional({ example: 13.7563 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 100.5018 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ default: 200, description: 'Clock-in geofence radius in metres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(20_000)
  geofenceRadiusM?: number;

  @ApiPropertyOptional({ type: [String], description: 'CIDR or exact IPs allowed to clock in' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];
}

export class UpdateWorkLocationDto extends PartialType(CreateWorkLocationDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-04-13' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: 'วันสงกรานต์' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Songkran Festival' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional({ description: 'Restrict to one worksite; omit for org-wide' })
  @IsOptional()
  @IsUUID()
  workLocationId?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @ApiPropertyOptional({ example: 'Asia/Bangkok' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'THB' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 'th' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultLocale?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;
}
