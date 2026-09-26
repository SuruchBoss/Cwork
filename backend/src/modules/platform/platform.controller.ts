// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { Public } from '../../core/security/decorators';
import { PlatformConfigDto } from './dto/platform.dto';

/**
 * What this deployment offers, for a client deciding what to put on screen.
 *
 * Public, because a client needs it to render its shell and nothing here is
 * worth protecting: that an installation does or does not have an AI assistant
 * is not a secret, and knowing it buys nothing — every assistant endpoint still
 * demands a session and `assistant:use`.
 *
 * The point of the endpoint is that a control which fails when pressed reads as
 * a broken product rather than a disabled option. `ASSISTANT_ENABLED=false` is
 * the default, so without this every standard install shipped an assistant
 * entry that could not work.
 */
@ApiTags('Platform')
@Controller('config')
export class PlatformController {
  constructor(@Inject(APP_CONFIG) private readonly config: RootConfig) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Feature flags this deployment exposes to its clients' })
  clientConfig(): PlatformConfigDto {
    return { assistantEnabled: this.config.assistant.enabled };
  }
}
