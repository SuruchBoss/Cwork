// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { BadRequestException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * The filter is the only thing standing between an internal error and the
 * client, so what it does with an error it was not told about matters as much
 * as what it does with the ones it was.
 */
describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  // Half of these cases are meant to log a stack trace; printing them would
  // bury the actual test output.
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  let status = 0;
  let body: Record<string, unknown> = {};

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status(code: number) {
          status = code;
          return {
            json(payload: Record<string, unknown>) {
              body = payload;
            },
          };
        },
      }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/files/upload', id: 'req-1' }),
    }),
  } as never;

  const handle = (error: unknown) => {
    status = 0;
    body = {};
    filter.catch(error, host);
    return { status, body };
  };

  /** Multer's own error shape: a plain Error with a `code` and that `name`. */
  const multerError = (code: string, message: string): Error => {
    const error = new Error(message);
    error.name = 'MulterError';
    (error as Error & { code: string }).code = code;
    return error;
  };

  describe('multipart errors', () => {
    it('answers 400 for a rejected field, whatever multer calls it', () => {
      // Read by `code`, never by message: multer renamed this one in 2.4 and
      // Nest's message table still carries the old wording.
      const { status, body } = handle(
        multerError('LIMIT_UNEXPECTED_FILE', 'Unexpected file field'),
      );

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body.code).toBe('VALIDATION_FAILED');
    });

    it('answers 400 for codes that did not exist when this was written', () => {
      // The point of matching on shape rather than an allow-list: a new multer
      // limit is still the client's bad request, not a server fault.
      const { status } = handle(multerError('LIMIT_FIELD_ARRAY_INDEX', 'whatever this says'));

      expect(status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('answers 413 for a file over the size limit', () => {
      const { status, body } = handle(multerError('LIMIT_FILE_SIZE', 'File too large'));

      expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('does not echo the offending field name back', () => {
      // It is attacker-chosen and can be megabytes long — repeating it is the
      // amplification the limits exist to prevent.
      const error = multerError('LIMIT_FIELD_COUNT', 'Too many fields') as Error & {
        field?: string;
      };
      error.field = 'a'.repeat(5000);

      const { body } = handle(error);

      expect(String(body.message)).toBe('Too many fields');
    });

    it('leaves an ordinary Error named MulterError alone', () => {
      // No `code`, so it is not multer's — and guessing would turn a real
      // server fault into a 400 the client cannot act on.
      const impostor = new Error('boom');
      impostor.name = 'MulterError';

      const { status, body } = handle(impostor);

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('the paths it already had', () => {
    it('keeps an HttpException’s own status and message', () => {
      const { status, body } = handle(new NotFoundException('Employee not found'));

      expect(status).toBe(HttpStatus.NOT_FOUND);
      expect(body.code).toBe('RESOURCE_NOT_FOUND');
      expect(body.message).toBe('Employee not found');
    });

    it('carries validation details through', () => {
      const { body } = handle(new BadRequestException(['email must be an email']));

      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.details).toEqual(['email must be an email']);
    });

    it('says nothing useful about an error it does not recognise', () => {
      const { status, body } = handle(new Error('connection string: postgres://user:pw@host'));

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.message).toBe('An unexpected error occurred');
    });
  });
});
