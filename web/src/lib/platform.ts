// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface PlatformConfig {
  assistantEnabled: boolean;
  /** The public demo (CW-031): one-click sign-in, and the data reset every hour. */
  demo: boolean;
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
  return usePlatformConfigState().config;
}

/**
 * The same answer, plus whether it has arrived — for the one screen that draws
 * something different on the demo (the sign-in page), and would otherwise show
 * a password form for a moment before swapping it for the demo's buttons. An
 * API that cannot be reached counts as arrived: the ordinary form is the right
 * thing to show, and the sign-in attempt will say what is wrong.
 */
export function usePlatformConfigState(): { config: PlatformConfig; settled: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => api.get<PlatformConfig>('/config', { anonymous: true }),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return { config: data ?? { assistantEnabled: false, demo: false }, settled: !isPending };
}
