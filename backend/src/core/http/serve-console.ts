// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { INestApplication } from '@nestjs/common';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The console's security headers, as web/security-headers.conf gives them when
 * nginx serves it. Kept word for word: the console loads no third-party script,
 * so a policy served from here has no more reason to relax than nginx's.
 */
const CONSOLE_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function withHeaders(res: Response, cacheControl: string): void {
  for (const [name, value] of Object.entries(CONSOLE_HEADERS)) res.setHeader(name, value);
  res.setHeader('Cache-Control', cacheControl);
}

/**
 * Serves a built console from the API itself, for a deployment with room for
 * one service and no nginx — the public demo (CW-031). What web/nginx.conf does,
 * in the same order: hashed assets cached for a year, `index.html` never
 * cached, and every other path that is not the API's handed to the console's
 * router.
 *
 * Registered before Nest's routes, so it steps aside for the API prefix and
 * the health probes rather than shadowing them.
 */
export function serveConsole(app: INestApplication, dir: string, apiPrefix: string): void {
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error(
      `CONSOLE_DIR=${dir} has no index.html. Build the console (web/) into it first.`,
    );
  }

  const api = `/${apiPrefix.replace(/^\/+|\/+$/g, '')}`;
  const isServerRoute = (path: string): boolean =>
    path === api || path.startsWith(`${api}/`) || path === '/health' || path.startsWith('/health/');

  app.use(
    '/assets',
    express.static(join(root, 'assets'), {
      index: false,
      // A missing chunk is a 404, as nginx has it — never the console's page.
      fallthrough: false,
      setHeaders: (res) => withHeaders(res, 'public, max-age=31536000, immutable'),
    }),
  );
  const files = express.static(root, {
    index: false,
    setHeaders: (res) => withHeaders(res, 'no-cache'),
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    isServerRoute(req.path) ? next() : files(req, res, next),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isServerRoute(req.path)) return next();
    withHeaders(res, 'no-cache, no-store, must-revalidate');
    res.sendFile(index);
  });
}
