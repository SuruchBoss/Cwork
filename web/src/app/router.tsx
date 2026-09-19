import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { RequirePermission, RequireAuth } from './guards';
import { P } from '@/lib/permissions';
import { t } from '@/lib/i18n';

// Route-level code splitting: the console is large and most roles only ever
// open a handful of these screens.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const SetupPage = lazy(() => import('@/features/setup/SetupPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ApprovalsPage = lazy(() => import('@/features/approvals/ApprovalsPage'));
const EmployeeListPage = lazy(() => import('@/features/employees/EmployeeListPage'));
const EmployeeDetailPage = lazy(() => import('@/features/employees/EmployeeDetailPage'));
const OffboardingPage = lazy(() => import('@/features/employees/OffboardingPage'));
const LeavePage = lazy(() => import('@/features/leave/LeavePage'));
const AttendancePage = lazy(() => import('@/features/attendance/AttendancePage'));
const RosterPage = lazy(() => import('@/features/attendance/RosterPage'));
const PayrollPage = lazy(() => import('@/features/payroll/PayrollPage'));
const PayrollRunPage = lazy(() => import('@/features/payroll/PayrollRunPage'));
const ExpensesPage = lazy(() => import('@/features/payroll/ExpensesPage'));
const BenefitsPage = lazy(() => import('@/features/payroll/BenefitsPage'));
const RecruitmentPage = lazy(() => import('@/features/recruitment/RecruitmentPage'));
const PerformancePage = lazy(() => import('@/features/performance/PerformancePage'));
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage'));
const KnowledgePage = lazy(() => import('@/features/assistant/KnowledgePage'));
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'));
const OrganizationPage = lazy(() => import('@/features/settings/OrganizationPage'));
const AuditPage = lazy(() => import('@/features/settings/AuditPage'));
const NotFoundPage = lazy(() => import('@/features/settings/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="page">
      <div className="card">
        <div className="card__body">
          <div className="row" style={{ gap: 10 }}>
            <span className="spinner" aria-hidden />
            <span className="muted">{t('Loading')}…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuspenseOutlet() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    // Outside RequireAuth on purpose: this runs before any account exists. What
    // stands in for authentication here is the one-time token the wizard asks
    // for, which only a process with shell access to the server can mint.
    path: '/setup',
    element: (
      <Suspense fallback={<RouteFallback />}>
        <SetupPage />
      </Suspense>
    ),
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<RouteFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            element: <SuspenseOutlet />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'approvals', element: <ApprovalsPage /> },
              {
                path: 'employees',
                element: <RequirePermission any={[P.EMPLOYEE_READ, P.EMPLOYEE_READ_TEAM]} />,
                children: [
                  { index: true, element: <EmployeeListPage /> },
                  { path: ':id', element: <EmployeeDetailPage /> },
                ],
              },
              {
                path: 'offboarding',
                element: <RequirePermission any={[P.OFFBOARDING_READ]} />,
                children: [{ index: true, element: <OffboardingPage /> }],
              },
              {
                path: 'leave',
                element: <RequirePermission any={[P.LEAVE_READ, P.LEAVE_READ_TEAM]} />,
                children: [{ index: true, element: <LeavePage /> }],
              },
              {
                path: 'attendance',
                element: <RequirePermission any={[P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM]} />,
                children: [{ index: true, element: <AttendancePage /> }],
              },
              {
                path: 'roster',
                element: (
                  <RequirePermission
                    any={[P.SHIFT_MANAGE, P.ATTENDANCE_READ, P.ATTENDANCE_READ_TEAM]}
                  />
                ),
                children: [{ index: true, element: <RosterPage /> }],
              },
              {
                path: 'payroll',
                element: <RequirePermission any={[P.PAYROLL_READ]} />,
                children: [
                  { index: true, element: <PayrollPage /> },
                  { path: 'runs/:id', element: <PayrollRunPage /> },
                ],
              },
              {
                path: 'expenses',
                element: <RequirePermission any={[P.EXPENSE_READ]} />,
                children: [{ index: true, element: <ExpensesPage /> }],
              },
              {
                path: 'benefits',
                element: <RequirePermission any={[P.BENEFIT_READ, P.BENEFIT_MANAGE]} />,
                children: [{ index: true, element: <BenefitsPage /> }],
              },
              {
                path: 'recruitment',
                element: <RequirePermission any={[P.RECRUITMENT_READ]} />,
                children: [{ index: true, element: <RecruitmentPage /> }],
              },
              {
                path: 'performance',
                element: <RequirePermission any={[P.PERFORMANCE_READ, P.KPI_MANAGE_TEAM]} />,
                children: [{ index: true, element: <PerformancePage /> }],
              },
              {
                path: 'documents',
                element: <RequirePermission any={[P.DOCUMENT_ISSUE]} />,
                children: [{ index: true, element: <DocumentsPage /> }],
              },
              {
                path: 'knowledge',
                element: <RequirePermission any={[P.ASSISTANT_KNOWLEDGE_MANAGE]} />,
                children: [{ index: true, element: <KnowledgePage /> }],
              },
              {
                path: 'assistant',
                element: <RequirePermission any={[P.ASSISTANT_USE]} />,
                children: [{ index: true, element: <AssistantPage /> }],
              },
              {
                path: 'organization',
                element: <RequirePermission any={[P.ORG_READ]} />,
                children: [{ index: true, element: <OrganizationPage /> }],
              },
              {
                path: 'audit',
                element: <RequirePermission any={[P.AUDIT_READ]} />,
                children: [{ index: true, element: <AuditPage /> }],
              },
              { path: '404', element: <NotFoundPage /> },
              { path: '*', element: <Navigate to="/404" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);
