import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

/**
 * Server state lives here; client state lives in Zustand. The split matters:
 * anything that can go stale because someone else changed it belongs to Query,
 * which owns caching, refetching and invalidation.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 403 or a validation error just wastes time and log space.
        if (error instanceof ApiError && error.isTerminal) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Query keys in one place, so invalidation never guesses at a string. */
export const qk = {
  me: ['me'] as const,

  employees: (filters?: unknown) => ['employees', filters] as const,
  employee: (id: string) => ['employees', id] as const,
  employmentEvents: (id: string) => ['employees', id, 'events'] as const,
  departments: ['departments'] as const,
  departmentTree: ['departments', 'tree'] as const,
  positions: ['positions'] as const,
  workLocations: ['work-locations'] as const,
  holidays: (year?: number) => ['holidays', year] as const,

  leaveTypes: ['leave', 'types'] as const,
  leaveBalances: (employeeId: string, year?: number) =>
    ['leave', 'balances', employeeId, year] as const,
  leaveRequests: (filters?: unknown) => ['leave', 'requests', filters] as const,
  leaveRequest: (id: string) => ['leave', 'requests', id] as const,
  leaveCalendar: (from: string, to: string) => ['leave', 'calendar', from, to] as const,

  attendanceRecords: (filters?: unknown) => ['attendance', 'records', filters] as const,
  attendanceToday: ['attendance', 'today'] as const,
  attendanceCorrections: (status?: string) => ['attendance', 'corrections', status] as const,
  overtimeRequests: (filters?: unknown) => ['overtime', filters] as const,

  shifts: (includeInactive?: boolean) => ['shifts', includeInactive] as const,
  workSchedules: (includeInactive?: boolean) => ['work-schedules', includeInactive] as const,
  scheduleAssignments: (employeeId?: string) => ['schedule-assignments', employeeId] as const,
  roster: (from: string, to: string, departmentId?: string) =>
    ['roster', from, to, departmentId] as const,

  approvalTasks: (status?: string) => ['approvals', 'tasks', status] as const,
  approvalInstance: (entityType: string, entityId: string) =>
    ['approvals', entityType, entityId] as const,

  payrollPeriods: (year?: number) => ['payroll', 'periods', year] as const,
  payrollRuns: (periodId?: string) => ['payroll', 'runs', periodId] as const,
  payrollRun: (id: string) => ['payroll', 'runs', id] as const,
  payslip: (id: string) => ['payroll', 'payslips', id] as const,
  myPayslips: (year?: number) => ['payroll', 'payslips', 'me', year] as const,

  applications: (filters?: unknown) => ['recruitment', 'applications', filters] as const,
  application: (id: string) => ['recruitment', 'applications', id] as const,
  postings: (status?: string) => ['recruitment', 'postings', status] as const,
  requisitions: (status?: string) => ['recruitment', 'requisitions', status] as const,

  reviewCycles: ['performance', 'cycles'] as const,
  kpiGoals: (cycleId: string, employeeId?: string) =>
    ['performance', 'goals', cycleId, employeeId] as const,
  teamProgress: (cycleId: string) => ['performance', 'team-progress', cycleId] as const,

  documentRequests: (status?: string) => ['documents', status] as const,
  expenseClaims: (filters?: unknown) => ['expenses', filters] as const,

  benefitPlans: ['benefit-plans'] as const,
  benefitEnrollments: (employeeId: string) => ['benefit-enrollments', employeeId] as const,

  knowledgeDocuments: (status?: string) => ['knowledge', status] as const,
  knowledgeDocument: (id: string) => ['knowledge', id] as const,
  conversations: ['assistant', 'conversations'] as const,
  conversation: (id: string) => ['assistant', 'conversations', id] as const,

  notifications: (unread?: boolean) => ['notifications', unread] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  auditLogs: (filters?: unknown) => ['audit-logs', filters] as const,
};
