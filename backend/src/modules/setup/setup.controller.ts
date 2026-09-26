// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/security/decorators';
import { suggestOrganizationCode } from './domain/organization-code';
import { CompleteSetupDto, SetupCompletedDto, SetupStatusDto } from './dto/setup.dto';
import { SetupService } from './setup.service';

/**
 * As tight as the sign-in endpoints. The token is 32 random bytes and is not
 * realistically guessable, but a route that creates an administrator gets the
 * credential budget regardless.
 *
 * Read straight from the environment for the same reason `auth.controller.ts`
 * does: `@Throttle` is evaluated when the class is defined, before DI exists.
 */
const SETUP_THROTTLE = {
  default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 },
};

/**
 * The first-run wizard's two endpoints.
 *
 * Both are `@Public()`, because there is nobody to authenticate as yet — which
 * is exactly why `POST /setup` demands a token that only a process with shell
 * access to the server can produce. Note what is missing: there is no endpoint
 * that issues a token. Adding one would turn "you must be the operator" back
 * into "you must be first".
 */
@ApiTags('Setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly service: SetupService) {}

  /**
   * Unauthenticated on purpose. It reveals one bit — whether this install has
   * been set up — which the sign-in page gives away anyway, and the console
   * needs it to know whether to offer the wizard or the login form. Knowing an
   * install is fresh still buys nothing without a token.
   */
  @Public()
  @Get('status')
  @ApiOperation({ summary: 'Whether this installation has been set up yet' })
  status(): Promise<SetupStatusDto> {
    return this.service.status();
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(SETUP_THROTTLE)
  @ApiOperation({
    summary: 'Create the organisation, the system roles and the first administrator',
    description:
      'Requires an unspent setup token from `npm run db:init -- --web`. Refuses ' +
      'once an organisation exists, token or no token. Returns no session: the ' +
      'new administrator signs in normally, and is required to enrol a second ' +
      'factor on the way.',
  })
  async complete(@Body() dto: CompleteSetupDto): Promise<SetupCompletedDto> {
    const result = await this.service.initialise(
      {
        organizationName: dto.organizationName,
        organizationCode: dto.organizationCode ?? suggestOrganizationCode(dto.organizationName),
        timezone: dto.timezone,
        adminEmail: dto.adminEmail,
        adminPassword: dto.adminPassword,
      },
      dto.token,
    );

    return { ...result, nextStep: 'sign-in-and-enrol-mfa' };
  }
}
