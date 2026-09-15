import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus, OvertimeType, PunchMethod, PunchType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/http/pagination.dto';

export class PunchDto {
  @ApiProperty({ enum: PunchType })
  @IsEnum(PunchType)
  type!: PunchType;

  @ApiPropertyOptional({ enum: PunchMethod, default: PunchMethod.MOBILE_GPS })
  @IsOptional()
  @IsEnum(PunchMethod)
  method?: PunchMethod;

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

  @ApiPropertyOptional({ description: 'Reported GPS accuracy radius in metres' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  accuracyM?: number;

  @ApiPropertyOptional({ description: 'Worksite the employee believes they are at' })
  @IsOptional()
  @IsUUID()
  workLocationId?: string;

  @ApiPropertyOptional({ description: 'Selfie captured at punch time' })
  @IsOptional()
  @IsUUID()
  selfieFileId?: string;

  @ApiPropertyOptional({
    description: 'Device clock at punch time; compared with the server clock to detect tampering',
  })
  @IsOptional()
  @IsDateString()
  clientTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Device reports a mock-location provider' })
  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;

  @ApiPropertyOptional({ description: 'Device reports root/jailbreak' })
  @IsOptional()
  @IsBoolean()
  isRootedDevice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description: 'Client-generated id so an offline queue can retry a punch safely',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientPunchId?: string;
}

export class AttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AttendanceStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(AttendanceStatus, { each: true })
  status?: AttendanceStatus[];

  @ApiPropertyOptional({ description: 'Only records with anomaly flags' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  anomaliesOnly?: boolean;
}

export class CreateCorrectionDto {
  @ApiProperty()
  @IsUUID()
  recordId!: string;

  @ApiPropertyOptional({ example: '2026-09-15T02:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  requestedClockIn?: string;

  @ApiPropertyOptional({ example: '2026-09-15T11:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  requestedClockOut?: string;

  @ApiProperty({ example: 'ลืมกดออกงานเพราะประชุมนอกสถานที่' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class CreateOvertimeDto {
  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  workDate!: string;

  @ApiProperty({ example: '2026-09-15T11:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-09-15T14:00:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ enum: OvertimeType })
  @IsOptional()
  @IsEnum(OvertimeType)
  type?: OvertimeType;

  @ApiProperty({ example: 'ปิดงบสิ้นเดือน' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class DecideOvertimeDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum({ APPROVE: 'APPROVE', REJECT: 'REJECT' })
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Approve fewer hours than requested' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  approvedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateShiftDto {
  @ApiProperty({ example: 'DAY' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'กะปกติ 09:00-18:00' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @MaxLength(5)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @MaxLength(5)
  endTime!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  graceInMinutes?: number;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  graceOutMinutes?: number;

  @ApiPropertyOptional({ default: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(1440)
  standardWorkMinutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFlexible?: boolean;
}
