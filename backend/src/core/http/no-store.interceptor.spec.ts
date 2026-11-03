// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { NO_STORE, NoStoreInterceptor } from './no-store.interceptor';

const contextFor = (headers: Record<string, string>, type = 'http') => {
  const response = {
    getHeader: (name: string) => headers[name],
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  return {
    getType: () => type,
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
};
const handler: CallHandler = { handle: () => of('answer') };

describe('NoStoreInterceptor', () => {
  it('tells caches to keep nothing', () => {
    const headers: Record<string, string> = {};

    new NoStoreInterceptor().intercept(contextFor(headers), handler);

    expect(headers['Cache-Control']).toBe(NO_STORE);
  });

  it('leaves alone what a response already said about being kept', () => {
    const headers: Record<string, string> = { 'Cache-Control': 'private, max-age=0, no-store' };

    new NoStoreInterceptor().intercept(contextFor(headers), handler);

    expect(headers['Cache-Control']).toBe('private, max-age=0, no-store');
  });

  it('does nothing for a request that is not over HTTP', () => {
    const headers: Record<string, string> = {};

    new NoStoreInterceptor().intercept(contextFor(headers, 'rpc'), handler);

    expect(headers['Cache-Control']).toBeUndefined();
  });
});
