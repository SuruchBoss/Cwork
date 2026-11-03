// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/** What a response that carries pay or personal data is told about being kept. */
export const NO_STORE = 'private, no-store';

/**
 * Tells every browser, and every cache on the way, not to keep an answer.
 *
 * What this API returns is pay and personal data about the people of one
 * organisation, for a signed-in caller to read. It is meant to be read on the
 * screen and not left behind in a browser or a proxy. So the default is to keep
 * nothing; a response that sets its own `Cache-Control` (a download, say) keeps
 * what it set.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const response = context.switchToHttp().getResponse<Response>();
      if (!response.getHeader('Cache-Control')) response.setHeader('Cache-Control', NO_STORE);
    }
    return next.handle();
  }
}
