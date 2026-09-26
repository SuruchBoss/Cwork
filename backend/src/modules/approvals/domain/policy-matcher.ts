// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Evaluates an ApprovalPolicy's `conditions` JSON against the submitted entity.
 *
 * Shape: `{ "<field>": { "<op>": <value> } }` — all fields must match (AND).
 * A shorthand of `{ "<field>": <value> }` means equality.
 *
 * Deliberately tiny: this is configuration written by HR admins, not a general
 * expression language. Anything it cannot express belongs in code.
 */
export type ConditionOperator =
  'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';

export type ConditionValue = string | number | boolean | null;
export type FieldCondition = Partial<Record<ConditionOperator, ConditionValue | ConditionValue[]>>;
export type PolicyConditions = Record<string, FieldCondition | ConditionValue>;

export function matchesConditions(
  conditions: PolicyConditions | null | undefined,
  subject: Record<string, unknown>,
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  return Object.entries(conditions).every(([field, condition]) => {
    const actual = subject[field];
    if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
      return looseEquals(actual, condition as ConditionValue);
    }
    return Object.entries(condition as FieldCondition).every(([op, expected]) =>
      evaluate(op as ConditionOperator, actual, expected),
    );
  });
}

function evaluate(op: ConditionOperator, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return looseEquals(actual, expected as ConditionValue);
    case 'ne':
      return !looseEquals(actual, expected as ConditionValue);
    case 'gt':
      return toNumber(actual) > toNumber(expected);
    case 'gte':
      return toNumber(actual) >= toNumber(expected);
    case 'lt':
      return toNumber(actual) < toNumber(expected);
    case 'lte':
      return toNumber(actual) <= toNumber(expected);
    case 'in':
      return Array.isArray(expected) && expected.some((v) => looseEquals(actual, v));
    case 'nin':
      return Array.isArray(expected) && !expected.some((v) => looseEquals(actual, v));
    case 'contains':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(expected ?? '').toLowerCase());
    default:
      return false;
  }
}

/** Decimal columns arrive as objects/strings, so compare by normalised value. */
function looseEquals(actual: unknown, expected: ConditionValue): boolean {
  if (actual === expected) return true;
  if (actual === null || actual === undefined || expected === null) return actual == expected;
  if (typeof expected === 'number') return toNumber(actual) === expected;
  if (typeof expected === 'boolean') return Boolean(actual) === expected;
  return String(actual) === String(expected);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return Number.NaN;
  return Number(String(value));
}
