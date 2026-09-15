import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
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

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

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
}
