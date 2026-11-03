// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { ConflictError, NotFoundError } from '../../core/errors/domain.errors';
import { ADVISORY_LOCK_FAMILIES, ADVISORY_LOCK_NAMESPACE } from '../../core/prisma/advisory-lock';
import { ScannerBindingsService } from './scanner-bindings.service';

/**
 * Two requests binding one scanner number at the same moment (CW-109). The
 * database refuses overlapping periods, but two inserts for one number can wait
 * on each other and one is rolled back as a deadlock. These pin the two things
 * that keep that from reaching a person as a server error: writes for a number
 * take their turn, and a deadlock that still happens is said in words.
 */
describe('ScannerBindingsService concurrency', () => {
  const lockArgs: unknown[][] = [];

  function service(calls: string[]) {
    lockArgs.length = 0;
    const tx = {
      $executeRaw: jest.fn(async (...args: unknown[]) => {
        lockArgs.push(args);
        calls.push('lock');
        return 0;
      }),
      employee: {
        findFirst: jest.fn(async () => {
          calls.push('read');
          return null;
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (t: typeof tx) => Promise<unknown>) => {
        calls.push('begin');
        return work(tx);
      }),
    };
    return new ScannerBindingsService(prisma as never, {} as never, {} as never);
  }

  const input = {
    organizationId: 'org-1',
    actorUserId: 'user-1',
    employeeId: 'emp-1',
    scannerNumber: '12',
    from: null,
    to: null,
  };

  it('opens a transaction and takes the number’s lock before it reads anything', async () => {
    const calls: string[] = [];

    await expect(service(calls).bind(input)).rejects.toBeInstanceOf(NotFoundError);

    expect(calls).toEqual(['begin', 'lock', 'read']);
  });

  it('locks under its own family, with the organisation and the number in the second key', async () => {
    await service([])
      .bind(input)
      .catch(() => undefined);

    const [, family, organization, number] = lockArgs[0]!;
    expect(family).toBe(ADVISORY_LOCK_FAMILIES['scanner-number']);
    expect([organization, number]).toEqual(['org-1', '12']);
    // Never the namespace the job locks live under, so a hash cannot be taken for a job.
    expect(family).not.toBe(ADVISORY_LOCK_NAMESPACE);
  });

  it('takes the lock inside a transaction that is already open, without opening another', async () => {
    const calls: string[] = [];
    const open = {
      $executeRaw: jest.fn(async () => {
        calls.push('lock');
        return 0;
      }),
      employee: {
        findFirst: jest.fn(async () => {
          calls.push('read');
          return null;
        }),
      },
    };

    await expect(service(calls).bind(input, open as never)).rejects.toBeInstanceOf(NotFoundError);

    expect(calls).toEqual(['lock', 'read']);
  });

  it('takes no lock when there is no number to bind', async () => {
    const calls: string[] = [];
    const none = {
      $executeRaw: jest.fn(),
      employeeScannerNumber: { findFirst: jest.fn(async () => null) },
    };

    await service(calls).setInUse({ ...input, scannerNumber: null }, none as never);

    expect(none.$executeRaw).not.toHaveBeenCalled();
  });

  describe('a refusal by the database', () => {
    const refusal = (error: unknown) =>
      (
        service([]) as unknown as {
          refusalFrom: (e: unknown, code: string, n: string) => Error | null;
        }
      ).refusalFrom(error, 'EMP-1', '12');

    it('says a deadlock in words, with a code the console knows', () => {
      const said = refusal(new Error('Process 1 waits for ShareLock; deadlock detected'));

      expect(said).toBeInstanceOf(ConflictError);
      expect(said?.message).toContain('ลองอีกครั้ง');
      expect((said as ConflictError).getResponse()).toMatchObject({ code: 'SCANNER_NUMBER_BUSY' });
    });

    it('says a write conflict the same way', () => {
      const conflict = Object.assign(new Error('Transaction failed'), { code: 'P2034' });

      expect((refusal(conflict) as ConflictError).getResponse()).toMatchObject({
        code: 'SCANNER_NUMBER_BUSY',
      });
    });

    it('leaves an error it does not know alone', () => {
      expect(refusal(new Error('connection reset'))).toBeNull();
    });
  });
});
