// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/app/query-client';
import { api } from '@/lib/api-client';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { EmployeeSummary, Page } from '@/types/api';

export interface DepartmentOption {
  id: string;
  name: string;
}

/** The most a page of `/employees` may hold; the API refuses a bigger `limit`. */
const MAX_PAGE = 200;

/**
 * The departments a filter box may offer (CW-095).
 *
 * `/departments` needs `org:read`, which a manager does not hold, so asking it
 * anyway fills the browser console with 403s. Without that permission the list
 * is built from the people the person can see, one department per name, which
 * is also the right list: a manager's filter should not offer a department
 * whose people they cannot open. Someone who can read the organisation still
 * gets every department, empty ones included.
 */
export function useDepartmentOptions(): DepartmentOption[] {
  const canReadOrg = useAuthStore((s) => s.canAny(P.ORG_READ));
  const canListPeople = useAuthStore((s) =>
    s.canAny(P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM, P.EMPLOYEE_READ_SELF),
  );

  const all = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<DepartmentOption[]>('/departments'),
    enabled: canReadOrg,
  });

  const seen = useQuery({
    queryKey: qk.employees({ scope: 'department-options' }),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', {
        query: { page: 1, limit: MAX_PAGE, sortBy: 'employeeCode', sortOrder: 'asc' },
      }),
    enabled: !canReadOrg && canListPeople,
    select: (page) => departmentsOf(page.data),
  });

  return (canReadOrg ? all.data : seen.data) ?? [];
}

/** Each department that someone in `people` belongs to, once, by name. */
export function departmentsOf(people: Array<Pick<EmployeeSummary, 'department'>>) {
  const byId = new Map<string, DepartmentOption>();
  for (const person of people) {
    const dept = person.department;
    if (dept && !byId.has(dept.id)) byId.set(dept.id, { id: dept.id, name: dept.name });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
