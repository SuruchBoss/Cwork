// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** What an API response is told about being kept. */
export const NO_STORE = 'private, no-store';

/**
 * Tells every browser, and every cache on the way, not to keep an API answer.
 *
 * What this API returns is pay and personal data about the people of one
 * organisation, for a signed-in caller to read on the screen and not to be left
 * behind in a browser or a proxy. It is set as the request arrives, before any
 * guard or handler runs, so it covers an answer that is a refusal (a 401 or 403
 * from a guard) and a route that does not exist as well as a success.
 *
 * A response that sets its own `Cache-Control` later (a download, say) replaces
 * this value. The console's own files are not under the API's prefix and are
 * served before this runs, so they keep the caching they were given.
 */
@Injectable()
export class NoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', NO_STORE);
    next();
  }
}
