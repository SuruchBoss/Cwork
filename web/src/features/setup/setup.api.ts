// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { api } from '@/lib/api-client';

export interface SetupStatus {
  initialised: boolean;
}

export interface SetupRequest {
  token: string;
  organizationName: string;
  organizationCode?: string;
  timezone: string;
  adminEmail: string;
  adminPassword: string;
}

export interface SetupResult {
  organization: { id: string; code: string; name: string; timezone: string };
  administrator: { id: string; email: string; role: string };
  rolesCreated: number;
  nextStep: string;
}

/**
 * Both calls are anonymous by definition: there is no account to hold a token
 * for until the second one succeeds.
 */
export function fetchSetupStatus(): Promise<SetupStatus> {
  return api.get<SetupStatus>('/setup/status', { anonymous: true });
}

export function completeSetup(request: SetupRequest): Promise<SetupResult> {
  return api.post<SetupResult>('/setup', request, { anonymous: true });
}
