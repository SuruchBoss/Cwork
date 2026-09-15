import { z } from 'zod';
import type { SetupRequest } from './setup.api';

/**
 * The same rules the API enforces, stated once on this side so a typo is caught
 * before it costs a round trip — and, more to the point, before it spends the
 * one-time token.
 */
export const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/;

export const setupSchema = z
  .object({
    token: z.string().trim().min(10, 'กรุณาวางโทเคนที่ได้จาก db:init'),
    organizationName: z.string().trim().min(2, 'ชื่อองค์กรสั้นเกินไป'),
    organizationCode: z
      .string()
      .trim()
      .regex(ORGANIZATION_CODE_PATTERN, 'ใช้ A–Z, 0–9, - หรือ _ ความยาว 2–12 ตัว')
      .or(z.literal(''))
      .optional(),
    timezone: z.string().trim().min(1, 'กรุณาระบุเขตเวลา'),
    // Trimmed before the format check: a pasted address often brings a space
    // with it, and "อีเมลไม่ถูกต้อง" would be a baffling thing to say about it.
    adminEmail: z.string().trim().pipe(z.email('อีเมลไม่ถูกต้อง')),
    adminPassword: z.string().min(12, 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.adminPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'รหัสผ่านไม่ตรงกัน',
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
