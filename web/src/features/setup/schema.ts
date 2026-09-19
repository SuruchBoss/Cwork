import { z } from 'zod';
import type { SetupRequest } from './setup.api';

/**
 * The same rules the API enforces, stated once on this side so a typo is caught
 * before it costs a round trip — and, more to the point, before it spends the
 * one-time token.
 */
export const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/;

/**
 * Validation messages are English message keys (CW-016), not display text: the
 * form translates each one through `t()` at the point it shows it, so the same
 * schema serves both languages and the catalogue stays the single source of the
 * Thai wording.
 */
export const setupSchema = z
  .object({
    token: z.string().trim().min(10, 'Paste the token from db:init'),
    organizationName: z.string().trim().min(2, 'The organisation name is too short'),
    organizationCode: z
      .string()
      .trim()
      .regex(ORGANIZATION_CODE_PATTERN, 'Use A–Z, 0–9, - or _, 2–12 characters')
      .or(z.literal(''))
      .optional(),
    timezone: z.string().trim().min(1, 'Please provide a time zone'),
    // Trimmed before the format check: a pasted address often brings a space
    // with it, and "invalid email" would be a baffling thing to say about it.
    adminEmail: z.string().trim().pipe(z.email('Invalid email')),
    adminPassword: z.string().min(12, 'The password must be at least 12 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.adminPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  });

export type SetupFormValues = z.infer<typeof setupSchema>;

/**
 * Form values as the API wants them.
 *
 * `confirmPassword` never leaves the browser, and an empty code is dropped
 * rather than sent: the server derives a better one from the name than an empty
 * string would, and the endpoint rejects unknown-shaped values outright.
 */
export function toSetupRequest(values: SetupFormValues): SetupRequest {
  const code = values.organizationCode?.trim();
  return {
    token: values.token.trim(),
    organizationName: values.organizationName.trim(),
    ...(code ? { organizationCode: code.toUpperCase() } : {}),
    timezone: values.timezone.trim(),
    adminEmail: values.adminEmail.trim().toLowerCase(),
    adminPassword: values.adminPassword,
  };
}
