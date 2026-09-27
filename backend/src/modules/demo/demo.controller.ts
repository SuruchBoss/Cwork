// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { Public } from '../../core/security/decorators';
import { LoginResponseDto } from '../auth/dto/auth.dto';
import { DEMO_ROLES, DemoService, type DemoRole } from './demo.service';

export class DemoSignInDto {
  @ApiProperty({ enum: DEMO_ROLES, description: 'Which of the three shared demo accounts' })
  @IsIn(DEMO_ROLES)
  as!: DemoRole;
}

export class DemoStatusDto {
  @ApiProperty({ description: 'True while the data is being put back; other routes answer 503' })
  resetting!: boolean;

  @ApiProperty({ description: 'When the data is next put back to the demo seed (ISO 8601)' })
  nextResetAt!: string;

  @ApiProperty({ enum: DEMO_ROLES, isArray: true })
  roles!: DemoRole[];
}

/**
 * The public demo's two routes. They exist only when `DEMO_MODE=true`; on
 * every other deployment `/demo` is a 404 like any path that is not there.
 */
@ApiTags('Demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'When the demo next resets, and whether it is resetting now' })
  status(): DemoStatusDto {
    return this.demo.status();
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  // The global rate limit, not the credential endpoints' tight one: there is
  // no secret here to guess, and every visitor behind one office's address
  // shares the budget.
  @ApiOperation({
    summary: 'Sign in as the demo employee, manager or HR, with no password',
    description:
      'The demo accounts have no password anybody knows. This is the only way in, ' +
      'and it puts back anything about the account a previous visitor changed that ' +
      'would keep the next one out.',
  })
  signIn(@Body() dto: DemoSignInDto): Promise<LoginResponseDto> {
    return this.demo.signIn(dto.as);
  }
}
