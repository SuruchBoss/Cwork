// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { HttpStatus, Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG } from '../../core/config/config.token';
import type { RootConfig } from '../../core/config/configuration';
import { demoRefusal } from './demo-rules';
import { DemoService } from './demo.service';

/** Seconds a client is told to wait while the data is put back. */
const RESET_RETRY_AFTER_SECONDS = 15;

/**
 * The demo's door, in front of every API route and every guard.
 *
 * While the data is being put back, every request but the demo's own status is
 * answered 503 with `DEMO_RESETTING`: the console shows a message instead of
 * the errors a half-emptied database would produce. Otherwise it refuses what
 * `demoRefusal` lists, and counts the request so the schedule knows when the
 * demo was last used and whether anything in it changed.
 *
 * The response bodies have the shape AllExceptionsFilter gives every error, so
 * the clients read them the same way.
 */
@Injectable()
export class DemoGateMiddleware implements NestMiddleware {
  constructor(
    @Inject(APP_CONFIG) private readonly config: RootConfig,
    private readonly demo: DemoService,
  ) {}

  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const path = req.originalUrl.split('?')[0];
    const prefix = `/${this.config.app.apiPrefix}/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const own = new RegExp(`^${prefix}v\\d+/(demo|config)$`).test(path);

    if (this.demo.isResetting() && !(own && req.method === 'GET')) {
      res.setHeader('Retry-After', String(RESET_RETRY_AFTER_SECONDS));
      this.reply(req, res, HttpStatus.SERVICE_UNAVAILABLE, {
        code: 'DEMO_RESETTING',
        message: 'The demo is being put back to its starting data. It will be ready in a moment.',
      });
      return;
    }

    const refusal = demoRefusal(
      { method: req.method, path, contentType: req.headers['content-type'], body: req.body },
      this.config.app.apiPrefix,
    );
    if (refusal) {
      this.reply(req, res, HttpStatus.FORBIDDEN, refusal);
      return;
    }

    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
    const finished = this.demo.requestStarted(write);
    res.on('finish', finished);
    res.on('close', finished);
    next();
  }

  private reply(
    req: Request & { id?: string },
    res: Response,
    statusCode: number,
    error: { code: string; message: string },
  ): void {
    res.status(statusCode).json({
      statusCode,
      code: error.code,
      message: error.message,
      path: req.originalUrl,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
}
