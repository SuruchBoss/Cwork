// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { setupSchema, toSetupRequest, type SetupFormValues } from '../schema';

const valid: SetupFormValues = {
  token: 'abcdefghijklmnopqrstuvwxyz0123456789',
  organizationName: '  บริษัท ตัวอย่าง จำกัด  ',
  organizationCode: ' acme ',
  timezone: 'Asia/Bangkok',
  adminEmail: '  Owner@Acme.CO.TH ',
  adminPassword: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
};

describe('setup form', () => {
  it('accepts a filled-in form', () => {
    expect(setupSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a form whose two passwords differ', () => {
    const result = setupSchema.safeParse({ ...valid, confirmPassword: 'something else' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it('refuses a password the API would refuse anyway', () => {
    const short = 'short';
    const result = setupSchema.safeParse({
      ...valid,
      adminPassword: short,
      confirmPassword: short,
    });
    expect(result.success).toBe(false);
  });

  it('refuses an organisation code the API would refuse anyway', () => {
    expect(setupSchema.safeParse({ ...valid, organizationCode: 'a b c' }).success).toBe(false);
  });

  it('treats an empty code as "choose one for me"', () => {
    const parsed = setupSchema.parse({ ...valid, organizationCode: '' });
    expect(toSetupRequest(parsed)).not.toHaveProperty('organizationCode');
  });

  it('sends the server a tidied request and never the confirmation', () => {
    const request = toSetupRequest(setupSchema.parse(valid));

    expect(request).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz0123456789',
      organizationName: 'บริษัท ตัวอย่าง จำกัด',
      organizationCode: 'ACME',
      timezone: 'Asia/Bangkok',
      adminEmail: 'owner@acme.co.th',
      adminPassword: 'correct horse battery staple',
    });
    expect(request).not.toHaveProperty('confirmPassword');
  });
});
