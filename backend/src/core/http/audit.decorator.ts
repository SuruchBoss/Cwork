// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export const AUDIT_META_KEY = 'cwork:audit';

export interface AuditMetadata {
  action: string;
  entityType: string;
  summary?: string;
  /** Override when the affected id is not `result.id` or `params.id`. */
  resolveId?: (request: Request, result: unknown) => string | undefined;
}

/** Marks a handler so AuditInterceptor records a row after it succeeds. */
export const Audited = (meta: AuditMetadata) => SetMetadata(AUDIT_META_KEY, meta);
