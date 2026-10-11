// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { SystemRole } from '../../../core/security/roles';

export class GrantRoleDto {
  @ApiProperty({ enum: Object.values(SystemRole), example: SystemRole.HR_OFFICER })
  @IsIn(Object.values(SystemRole))
  roleKey!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Limit the role to one department: its employee:read covers only that department. ' +
      'Only offered for roles that read every employee and manage nothing organisation-wide.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: "YYYY-MM-DD, the last day the role applies in the organisation's timezone",
  })
  @IsOptional()
  @IsDateString()
  expiresOn?: string;
}
