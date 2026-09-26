// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { CATCH_ALL, channelEnabled, destinationFor, subjectFor } from './delivery-rules';

describe('channelEnabled', () => {
  it('says yes when nobody has expressed a preference', () => {
    // Silence is not consent to be ignored: a person who has never opened the
    // settings page should still hear that their leave was approved.
    expect(channelEnabled([], 'leave.approved', 'email')).toBe(true);
    expect(channelEnabled([], 'leave.approved', 'push')).toBe(true);
  });

  it('honours the catch-all row an unsubscribe link writes', () => {
    const rows = [{ type: CATCH_ALL, email: false, push: true }];

    expect(channelEnabled(rows, 'leave.approved', 'email')).toBe(false);
    expect(channelEnabled(rows, 'leave.approved', 'push')).toBe(true);
  });

  it('lets a specific type override the catch-all, in both directions', () => {
    const rows = [
      { type: CATCH_ALL, email: false, push: false },
      { type: 'payslip.published', email: true, push: false },
    ];

    expect(channelEnabled(rows, 'payslip.published', 'email')).toBe(true);
    expect(channelEnabled(rows, 'payslip.published', 'push')).toBe(false);
    expect(channelEnabled(rows, 'leave.approved', 'email')).toBe(false);
  });

  it('is not confused by a row for a different type', () => {
    const rows = [{ type: 'expense.approved', email: false, push: false }];

    expect(channelEnabled(rows, 'leave.approved', 'email')).toBe(true);
  });
});

describe('destinationFor', () => {
  it('points at the part of the console the notification is about', () => {
    expect(destinationFor('approval.leave_request.pending')).toBe('/approvals');
    expect(destinationFor('leave.approved')).toBe('/leave');
    expect(destinationFor('payslip.published')).toBe('/payroll/payslips');
  });

  it('falls back to the notification list for a type it has never seen', () => {
    // Better than a dead link: whatever it was, it is in the list.
    expect(destinationFor('something.invented.later')).toBe('/notifications');
    expect(destinationFor('FILE_INFECTED')).toBe('/notifications');
  });
});

describe('subjectFor', () => {
  it('tags the subject so a full inbox sorts', () => {
    expect(subjectFor('approval.leave_request.pending', 'มีคำขอรออนุมัติ')).toBe(
      '[รออนุมัติ] มีคำขอรออนุมัติ',
    );
  });

  it('leaves a type with no tag alone rather than inventing one', () => {
    expect(subjectFor('FILE_INFECTED', 'ไฟล์ถูกปฏิเสธ')).toBe('ไฟล์ถูกปฏิเสธ');
  });
});
