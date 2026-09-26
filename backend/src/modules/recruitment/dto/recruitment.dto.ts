// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApplicationStage,
  AssessmentKind,
  EmploymentType,
  HiringRecommendation,
  InterviewMode,
  PostingStatus,
  QuestionType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/http/pagination.dto';

export class CreateRequisitionDto {
  @ApiProperty({ example: 'Senior Backend Engineer' })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  positionId?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  headcount?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isReplacement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  replacingEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  targetStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justification?: string;
}

export class CreatePostingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  requisitionId?: string;

  @ApiProperty({ example: 'senior-backend-engineer' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase kebab-case' })
  @MaxLength(120)
  slug!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  requirements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  benefits?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationText?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRemote?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  showSalary?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Only visible to signed-in employees' })
  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({ description: 'Extra questions rendered on the application form' })
  @IsOptional()
  @IsArray()
  formSchema?: Array<Record<string, unknown>>;
}

/** Public application form — reachable without authentication. */
export class ApplyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Uploaded résumé file id' })
  @IsOptional()
  @IsUUID()
  resumeFileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  portfolioUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coverLetter?: string;

  @ApiPropertyOptional({ description: 'Answers to the posting’s custom questions' })
  @IsOptional()
  formAnswers?: Record<string, unknown>;

  @ApiProperty({
    description: 'PDPA consent to store and process the application. Required.',
    example: true,
  })
  @IsBoolean()
  consent!: boolean;
}

export class MoveStageDto {
  @ApiProperty({ enum: ApplicationStage })
  @IsEnum(ApplicationStage)
  stage!: ApplicationStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Required when moving to REJECTED' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}

export class ApplicationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  postingId?: string;

  @ApiPropertyOptional({ enum: ApplicationStage, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsEnum(ApplicationStage, { each: true })
  stage?: ApplicationStage[];
}

export class AssessmentQuestionDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex!: number;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type!: QuestionType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt!: string;

  @ApiPropertyOptional({ example: [{ key: 'a', text: 'Option A' }] })
  @IsOptional()
  @IsArray()
  options?: Array<{ key: string; text: string }>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  correctKeys?: string[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;
}

export class CreateAssessmentTemplateDto {
  @ApiProperty({ example: 'BACKEND_BASIC' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: AssessmentKind })
  @IsOptional()
  @IsEnum(AssessmentKind)
  kind?: AssessmentKind;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiProperty({ type: [AssessmentQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessmentQuestionDto)
  questions!: AssessmentQuestionDto[];
}

export class InviteAssessmentDto {
  @ApiProperty()
  @IsUUID()
  applicationId!: string;

  @ApiProperty()
  @IsUUID()
  templateId!: string;

  @ApiPropertyOptional({ default: 7, description: 'Days the invitation link stays valid' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  validForDays?: number;
}

export class SubmitAssessmentDto {
  @ApiProperty({ description: 'Single-use token from the invitation link' })
  @IsString()
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [{ questionId: 'uuid', selectedKeys: ['a'] }],
  })
  @IsArray()
  answers!: Array<{ questionId: string; selectedKeys?: string[]; textAnswer?: string }>;
}

export class ScheduleInterviewDto {
  @ApiProperty()
  @IsUUID()
  applicationId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  round?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ enum: InterviewMode })
  @IsOptional()
  @IsEnum(InterviewMode)
  mode?: InterviewMode;

  @ApiProperty({ example: '2026-10-01T03:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;

  @ApiProperty({ type: [String], description: 'Employee ids of the interviewers' })
  @IsArray()
  @IsUUID('4', { each: true })
  interviewerEmployeeIds!: string[];
}

export class SubmitScorecardDto {
  @ApiProperty({ example: [{ criterion: 'Problem solving', score: 4, weight: 2, note: '…' }] })
  @IsArray()
  criteria!: Array<{ criterion: string; score: number; weight?: number; note?: string }>;

  @ApiPropertyOptional({ enum: HiringRecommendation })
  @IsOptional()
  @IsEnum(HiringRecommendation)
  recommendation?: HiringRecommendation;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  concerns?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class CreateOfferDto {
  @ApiProperty()
  @IsUUID()
  applicationId!: string;

  @ApiProperty({ example: 65000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseSalary!: number;

  @ApiPropertyOptional({ example: [{ code: 'HOUSING', amount: 3000 }] })
  @IsOptional()
  @IsArray()
  allowances?: Array<{ code: string; amount: number }>;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  signOnBonus?: number;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(12)
  probationMonths?: number;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdatePostingStatusDto {
  @ApiProperty({ enum: PostingStatus })
  @IsEnum(PostingStatus)
  status!: PostingStatus;
}
