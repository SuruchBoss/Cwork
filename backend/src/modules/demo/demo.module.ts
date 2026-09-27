// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoGateMiddleware } from './demo.middleware';
import { DemoService } from './demo.service';

/**
 * The public demo (CW-031). AppModule imports it only when `DEMO_MODE=true`,
 * so on every other deployment none of this exists: no routes, no schedule, no
 * code path that could empty a table. docs/demo.md is the runbook.
 */
@Module({
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule implements NestModule {
  /** Read once, when AppModule is defined — the same moment the flag takes effect. */
  static enabledBy(env: NodeJS.ProcessEnv): boolean {
    return (env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(DemoGateMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
