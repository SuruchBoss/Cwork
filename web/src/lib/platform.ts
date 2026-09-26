// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface PlatformConfig {
  assistantEnabled: boolean;
}

/**
 * What this deployment offers.
 *
 * Anonymous and long-lived: it is decided by the server's environment, so it
 * cannot change while a tab is open, and refetching it would be noise. The
 * pessimistic default matters — until the answer arrives, a feature is treated
 * as off, so a screen never shows an entry point and then takes it away.
 */
export function usePlatformConfig(): PlatformConfig {
  const { data } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => api.get<PlatformConfig>('/config', { anonymous: true }),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? { assistantEnabled: false };
}
