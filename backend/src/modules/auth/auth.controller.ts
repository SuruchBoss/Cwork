// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { Public } from '../../core/security/decorators';
import { AuthService, type RequestMeta } from './auth.service';
import {
  AuthTokensDto,
  ChangePasswordDto,
  LoginDto,
  LoginResponseDto,
  MfaActivateDto,
  MfaActivateResponseDto,
  MfaChallengeResponseDto,
  MfaCodeDto,
  MfaEnrolDto,
  MfaEnrolmentResponseDto,
  MfaRecoveryCodesResponseDto,
  MfaStatusResponseDto,
  MfaVerifyDto,
  RefreshTokenDto,
  SessionUserDto,
} from './dto/auth.dto';
import { MfaService } from './mfa.service';

/**
 * Credential endpoints get a much tighter budget than the global limit.
 *
 * Read straight from the environment because `@Throttle` is evaluated when the
 * class is defined, long before DI exists. `AUTH_THROTTLE_LIMIT` is validated
 * with everything else in `env.validation.ts`; this is the same value, reached
 * earlier.
 */
const CREDENTIAL_THROTTLE = {
  default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfa: MfaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({
    summary: 'Sign in with email and password',
    description:
      'Returns a session, or — when the account owes a second factor — a ' +
      'challenge to complete at /auth/mfa/verify. Branch on `mfaRequired`.',
  })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto | MfaChallengeResponseDto> {
    return this.authService.login(dto, requestMeta(req));
  }

  // ------------------------------------------------------------------- MFA

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  // As tight as the password endpoint: this is the other half of the same door.
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiOperation({ summary: 'Finish a sign-in with a second factor' })
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.verifyMfa(dto, requestMeta(req));
  }

  /**
   * Enrolment is reachable two ways: from a session (a user adding a second
   * factor voluntarily) or from a challenge token (an account that may not hold
   * a session until it has one). Hence `@Public()` plus an explicit check.
   */
  @Public()
  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start two-factor enrolment — returns a secret and QR URI' })
  async beginMfaEnrolment(
    @Body() dto: MfaEnrolDto,
    @Req() req: Request,
  ): Promise<MfaEnrolmentResponseDto> {
    const userId = await this.resolveMfaSubject(req, dto.challengeToken);
    return this.mfa.beginEnrolment(userId);
  }

  /**
   * Mid-sign-in (a challenge token is sent), the code that activates the factor
   * is also the code that completes the sign-in, so the session comes back in
   * this response. There is no separate step that swaps a challenge for a
   * session: that would issue one without a code.
   */
  @Public()
  @Post('mfa/activate')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm a code to switch two-factor on, returning recovery codes',
    description:
      'With a challenge token (enrolling mid-sign-in) the response also carries ' +
      'the session in `session`. From an existing session it returns the codes only.',
  })
  async activateMfa(
    @Body() dto: MfaActivateDto,
    @Req() req: Request,
  ): Promise<MfaActivateResponseDto> {
    if (dto.challengeToken) {
      return this.authService.activateMfaAndSignIn(dto.challengeToken, dto, requestMeta(req));
    }
    const userId = await this.resolveMfaSubject(req);
    return this.mfa.activate(userId, dto.code, requestMeta(req));
  }

  @Get('mfa/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether this account has, or needs, a second factor' })
  mfaStatus(@CurrentUser() user: AuthenticatedUser): Promise<MfaStatusResponseDto> {
    return this.mfa.statusFor(user.userId);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn two-factor off — refused for privileged accounts' })
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
  ): Promise<{ disabled: true }> {
    await this.mfa.disable(user.userId, dto.code, requestMeta(req));
    return { disabled: true };
  }

  @Post('mfa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: Math.ceil(CREDENTIAL_THROTTLE.default.limit / 2), ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue a fresh set of recovery codes, invalidating the old ones' })
  regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
  ): Promise<MfaRecoveryCodesResponseDto> {
    return this.mfa.regenerateRecoveryCodes(user.userId, dto.code, requestMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken, requestMeta(req));
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session (or all sessions if no token is sent)' })
  logout(
    @Body() dto: Partial<RefreshTokenDto>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.authService.logout(dto?.refreshToken, user, requestMeta(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, roles and effective permissions' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<SessionUserDto> {
    return this.authService.buildSessionUser(user.userId);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: Math.ceil(CREDENTIAL_THROTTLE.default.limit / 2), ttl: 60_000 } })
  @ApiOperation({ summary: 'Change own password; signs out every other device' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.authService.changePassword(user, dto, requestMeta(req));
  }

  /**
   * Enrolment can be reached from a session or from a half-finished sign-in.
   * A challenge token wins when supplied; otherwise a Bearer access token is
   * required. Both are verified explicitly, because the endpoint is `@Public()`
   * and no guard has run.
   */
  private async resolveMfaSubject(req: Request, challengeToken?: string): Promise<string> {
    if (challengeToken) {
      const payload = await this.mfa.verifyChallengeToken(challengeToken);
      return payload.sub;
    }

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!bearer) {
      throw new UnauthorizedException('Sign in, or supply the challenge token from /auth/login');
    }
    return this.mfa.verifyAccessToken(bearer);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke one of your own sessions' })
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.authService.revokeSession(user, id);
  }
}

function requestMeta(req: Request & { id?: string }): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.id,
  };
}
