// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { BusinessRuleError } from '../../core/errors/domain.errors';

/**
 * NIST SP 800-63B style policy: length is what matters, plus a block-list of
 * obviously guessable values. We deliberately do not force character-class
 * rotation — it pushes people toward `Password1!` and quarterly increments.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  '123456789012',
  'qwertyuiop12',
  'administrator',
  'letmein12345',
  'cworkhris123',
  'welcome12345',
]);

export interface PasswordPolicyInput {
  password: string;
  minLength: number;
  email?: string;
  employeeCode?: string;
}

export function assertPasswordPolicy({
  password,
  minLength,
  email,
  employeeCode,
}: PasswordPolicyInput): void {
  const problems: string[] = [];

  if (password.length < minLength) {
    problems.push(`must be at least ${minLength} characters`);
  }
  if (password.length > 256) {
    problems.push('must be at most 256 characters');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    problems.push('is too common');
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('must not be a single repeated character');
  }
  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    problems.push('must not contain your email address');
  }
  if (employeeCode && password.toLowerCase().includes(employeeCode.toLowerCase())) {
    problems.push('must not contain your employee code');
  }

  if (problems.length > 0) {
    throw new BusinessRuleError('WEAK_PASSWORD', `Password ${problems.join(', ')}`, { problems });
  }
}
