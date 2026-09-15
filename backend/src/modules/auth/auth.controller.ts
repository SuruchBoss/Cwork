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
  RefreshTokenDto,
  SessionUserDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Credential endpoints get a much tighter budget than the global limit.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.login(dto, requestMeta(req));
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Change own password; signs out every other device' })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.authService.changePassword(user, dto, requestMeta(req));
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
