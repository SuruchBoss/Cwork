// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { Public } from '../../core/security/decorators';
import { readUnsubscribeToken } from './domain/unsubscribe-token';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  @ApiProperty({ type: [String], required: false, description: 'Omit to mark everything read' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}

class RegisterDeviceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ example: 'android' })
  @IsString()
  @MaxLength(32)
  platform!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

class PreferenceDto {
  @ApiProperty({ example: '*', description: '`*` for everything without a rule of its own' })
  @IsString()
  @MaxLength(64)
  type!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('unread') unread?: string) {
    return this.service.list(user.userId, unread === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread badge count' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.service.countUnread(user.userId) };
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark notifications as read' })
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkReadDto) {
    return { updated: await this.service.markRead(user.userId, dto.ids) };
  }

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register a device for push notifications' })
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.service.registerDevice(user.userId, dto.token, dto.platform, dto.deviceId);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister a push device' })
  unregisterDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: { token: string }) {
    return this.service.unregisterDevice(user.userId, dto.token);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'My notification preferences' })
  listPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPreferences(user.userId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Turn a channel on or off for one notification type' })
  setPreference(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreferenceDto) {
    return this.service.setPreference(user.userId, dto.type, {
      email: dto.email,
      push: dto.push,
    });
  }

  /**
   * The link in every email footer.
   *
   * Public, because somebody who has stopped reading these emails should not
   * have to sign in to stop receiving them — that is the difference between an
   * unsubscribe link and a complaint to the spam filter. The token is signed,
   * so the worst a guess achieves is turning off somebody's email, which they
   * undo in a click; it is rate-limited anyway, because a public endpoint that
   * writes a row always should be.
   */
  @Public()
  @Get('unsubscribe/:token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Stop receiving notification emails' })
  async unsubscribe(@Param('token') token: string): Promise<string> {
    const userId = readUnsubscribeToken(token, this.config.auth.accessSecret);
    // A 404 rather than a 400: an invalid token and a token for an account that
    // no longer exists are the same thing to whoever clicked it.
    if (!userId) throw new NotFoundException('This unsubscribe link is no longer valid');

    await this.service.unsubscribeFromEmail(userId);

    return page(
      'ยกเลิกการรับอีเมลแล้ว',
      'คุณจะไม่ได้รับอีเมลแจ้งเตือนจากระบบอีก การแจ้งเตือนในระบบยังทำงานตามปกติ ' +
        'และเปิดรับอีเมลใหม่ได้จากหน้าตั้งค่าการแจ้งเตือน',
    );
  }
}

/** A page rather than JSON: this one is opened by a person, from an email. */
function page(title: string, body: string): string {
  const escape = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return [
    '<!doctype html><html lang="th"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escape(title)}</title></head>`,
    '<body style="font-family:system-ui,sans-serif;line-height:1.6;max-width:32rem;',
    'margin:4rem auto;padding:0 1rem;color:#1f2933">',
    `<h1 style="font-size:1.25rem">${escape(title)}</h1>`,
    `<p>${escape(body)}</p>`,
    '</body></html>',
  ].join('');
}
