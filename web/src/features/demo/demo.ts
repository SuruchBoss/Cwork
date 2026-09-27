// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { usePlatformConfig } from '@/lib/platform';
import type { Language } from '@/lib/i18n';

/** The public demo's three shared accounts (CW-031). */
export type DemoRole = 'employee' | 'manager' | 'hr';

export const DEMO_ROLES: DemoRole[] = ['employee', 'manager', 'hr'];

export function isDemoRole(value: string | null): value is DemoRole {
  return value !== null && (DEMO_ROLES as string[]).includes(value);
}

/**
 * What each role is for, as the sign-in page offers it. English keys, like
 * everything the console shows (CW-016); `t()` translates them.
 */
export const DEMO_ROLE_COPY: Record<DemoRole, { title: string; what: string }> = {
  employee: {
    title: 'Employee',
    what: 'Request leave, ask for a document, open a payslip',
  },
  manager: {
    title: 'Manager',
    what: 'A leave request is waiting for your approval',
  },
  hr: {
    title: 'HR',
    what: 'The whole company: people, payroll, policy and the audit trail',
  },
};

export interface DemoStatus {
  resetting: boolean;
  nextResetAt: string;
  roles: DemoRole[];
}

/**
 * The recorded walkthrough, for what the demo cannot show: the AI assistant is
 * off here (no budget for strangers' model usage, decided 2026-09-25). Served
 * by the project's own site, in the language the console is in.
 */
export function walkthroughUrl(language: Language): string {
  return `https://suruchboss.github.io/Cwork/assets/walkthrough.${language === 'th' ? 'th' : 'en'}.mp4`;
}

/**
 * When the demo next resets. Polled slowly, since the time itself only moves
 * on the hour; the minutes-left figure is worked out on this side of the wire.
 */
export function useDemoStatus(): DemoStatus | undefined {
  const { demo } = usePlatformConfig();
  const { data } = useQuery({
    queryKey: ['demo-status'],
    queryFn: () => api.get<DemoStatus>('/demo', { anonymous: true }),
    enabled: demo,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  return demo ? data : undefined;
}

/** Whole minutes until `iso`, never below zero. */
export function minutesUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
}
