// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import type { PayrollRun, PayrollRunStatus } from '@/types/api';

/** The states in which a run waits for someone to approve it. */
export const RUNS_WAITING: PayrollRunStatus[] = ['CALCULATED', 'PENDING_APPROVAL'];

/** The query the runs page reads to show only the runs that wait for the signed-in approver. */
export const WAITING_FOR_ME_QUERY = 'waiting=me';

export function isWaitingForApproval(run: Pick<PayrollRun, 'status'>): boolean {
  return RUNS_WAITING.includes(run.status);
}

/** Whoever created or last calculated a run cannot approve it (CW-103). */
export function preparedBy(
  run: Pick<PayrollRun, 'createdById' | 'calculatedById'>,
  userId: string | undefined | null,
): boolean {
  return Boolean(userId) && (run.createdById === userId || run.calculatedById === userId);
}

/** The runs that wait for this person to approve them: waiting, and not prepared by them. */
export function waitingForApprover(runs: PayrollRun[], userId: string | undefined | null) {
  return runs.filter((run) => isWaitingForApproval(run) && !preparedBy(run, userId));
}
