// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { Request, Response } from 'express';
import { NO_STORE, NoStoreMiddleware } from './no-store.middleware';

describe('NoStoreMiddleware', () => {
  const run = () => {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;
    const next = jest.fn();
    new NoStoreMiddleware().use({} as Request, response, next);
    return { headers, next, response };
  };

  it('tells caches to keep nothing, then carries on to the route', () => {
    const { headers, next } = run();

    expect(headers['Cache-Control']).toBe(NO_STORE);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves a handler free to say something else afterwards', () => {
    const { headers, response } = run();

    response.setHeader('Cache-Control', 'private, max-age=0, no-store');

    expect(headers['Cache-Control']).toBe('private, max-age=0, no-store');
  });
});
