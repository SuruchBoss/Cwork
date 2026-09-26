// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Global, Module } from '@nestjs/common';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxRegistry } from './outbox.registry';
import { OutboxService } from './outbox.service';

/**
 * Global, because any module may need to record an event in its own
 * transaction and threading an import through every feature module to say so
 * would be noise. The dispatcher is the only consumer and lives here with it.
 */
@Global()
@Module({
  providers: [OutboxService, OutboxRegistry, OutboxDispatcher],
  exports: [OutboxService, OutboxRegistry, OutboxDispatcher],
})
export class OutboxModule {}
