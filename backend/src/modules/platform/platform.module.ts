// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';

/**
 * Deployment-level facts a client needs before it can draw anything. One
 * endpoint today; every future "does this installation have X" belongs here
 * rather than as another per-feature status route.
 */
@Module({ controllers: [PlatformController] })
export class PlatformModule {}
