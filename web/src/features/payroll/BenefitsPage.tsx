import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { qk } from '@/app/query-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDate, formatMoney, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { P } from '@/lib/permissions';
import { useAuthStore } from '@/stores/auth.store';
import type { BenefitEnrollment, BenefitPlan, EmployeeSummary, Page } from '@/types/api';

type Tab = 'plans' | 'enroll';

// value → English key; the key is translated at render time.
const CATEGORIES: { value: string; key: string }[] = [
  { value: 'HEALTH_INSURANCE', key: 'Health insurance' },
  { value: 'LIFE_INSURANCE', key: 'Life insurance' },
  { value: 'DENTAL', key: 'Dental' },
  { value: 'PROVIDENT_FUND', key: 'Provident fund' },
  { value: 'ALLOWANCE', key: 'Allowance' },
  { value: 'EQUIPMENT', key: 'Equipment' },
  { value: 'WELLNESS', key: 'Wellness' },
  { value: 'TRAINING', key: 'Training' },
  { value: 'TRANSPORT', key: 'Transport' },
  { value: 'MEAL', key: 'Meal' },
  { value: 'OTHER', key: 'Other' },
];
const categoryKey = (value: string) => CATEGORIES.find((c) => c.value === value)?.key ?? value;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function BenefitsPage() {
  const [tab, setTab] = useState<Tab>('plans');
  const canManage = useAuthStore((s) => s.can)(P.BENEFIT_MANAGE);
  const t = useT();

  return (
    <div className="page">
      <PageHeader
        title={t('Benefits')}
        description={t(
          'Benefit plans and employee enrolments — an enrolment is picked up automatically in the next payroll run',
        )}
      />

      <div className="row" role="tablist" style={{ gap: 8 }}>
        <Button variant={tab === 'plans' ? 'primary' : 'ghost'} onClick={() => setTab('plans')}>
          {t('Benefit plans')}
        </Button>
        {canManage && (
          <Button variant={tab === 'enroll' ? 'primary' : 'ghost'} onClick={() => setTab('enroll')}>
            {t('Enrol employees')}
          </Button>
        )}
      </div>

      {tab === 'plans' ? <PlansTab canManage={canManage} /> : <EnrollTab />}
    </div>
  );
}

// --------------------------------------------------------------------- plans

const emptyPlan = {
  code: '',
  name: '',
  category: 'HEALTH_INSURANCE',
  employeeCostPerPeriod: 0,
  employerCostPerPeriod: 0,
};

function PlansTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyPlan);

  const plans = useQuery({
    queryKey: qk.benefitPlans,
    queryFn: () => api.get<BenefitPlan[]>('/benefits/plans'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['benefit-plans'] });
  const reset = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyPlan);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        category: form.category,
        employeeCostPerPeriod: Number(form.employeeCostPerPeriod),
        employerCostPerPeriod: Number(form.employerCostPerPeriod),
      };
      return editing
        ? api.patch(`/benefits/plans/${editing}`, body)
        : api.post('/benefits/plans', { ...body, code: form.code.trim().toUpperCase() });
    },
    onSuccess: () => {
      reset();
      invalidate();
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/benefits/plans/${id}`),
    onSuccess: invalidate,
  });

  const startEdit = (plan: BenefitPlan) => {
    setEditing(plan.id);
    setShowForm(true);
    setForm({
      code: plan.code,
      name: plan.name,
      category: plan.category,
      employeeCostPerPeriod: Number(plan.employeeCostPerPeriod),
      employerCostPerPeriod: Number(plan.employerCostPerPeriod),
    });
  };

  return (
    <div className="stack">
      {canManage && (
        <div className="row">
          <Button
            variant="primary"
            onClick={() => (showForm ? reset() : (setShowForm(true), setEditing(null)))}
          >
            + {t('Add a benefit plan')}
          </Button>
        </div>
      )}

      {showForm && canManage && (
        <Card title={editing ? t('Edit benefit plan') : t('Add benefit plan')}>
          <div className="stack">
            <div className="toolbar">
              <Field label={t('Code')}>
                <Input
                  value={form.code}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="HEALTH_STD"
                />
              </Field>
              <Field label={t('Plan name')}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('Group health insurance')}
                />
              </Field>
              <Field label={t('Category')}>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.key)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Employee pays/period')}>
                <Input
                  type="number"
                  min={0}
                  value={form.employeeCostPerPeriod}
                  onChange={(e) =>
                    setForm({ ...form, employeeCostPerPeriod: Number(e.target.value) || 0 })
                  }
                />
              </Field>
              <Field label={t('Employer pays/period')}>
                <Input
                  type="number"
                  min={0}
                  value={form.employerCostPerPeriod}
                  onChange={(e) =>
                    setForm({ ...form, employerCostPerPeriod: Number(e.target.value) || 0 })
                  }
                />
              </Field>
            </div>
            <div className="row">
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={!form.name.trim() || (!editing && !form.code.trim())}
                onClick={() => save.mutate()}
              >
                {t('Save')}
              </Button>
              <Button variant="ghost" onClick={reset}>
                {t('Cancel')}
              </Button>
            </div>
            {save.isError && (
              <div className="alert alert--danger" role="alert">
                {errorMessage(save.error, t('Could not save'))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card flush>
        {plans.isLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : plans.data && plans.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Plan')}</th>
                  <th>{t('Category')}</th>
                  <th className="num">{t('Employee pays')}</th>
                  <th className="num">{t('Employer pays')}</th>
                  <th className="num">{t('Enrolled')}</th>
                  <th className="num">{t('Employer cost/period')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {plans.data.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{plan.name}</div>
                      <div className="subtle mono">{plan.code}</div>
                    </td>
                    <td>{t(categoryKey(plan.category))}</td>
                    <td className="num">{formatMoney(plan.employeeCostPerPeriod)}</td>
                    <td className="num">{formatMoney(plan.employerCostPerPeriod)}</td>
                    <td className="num">{plan.activeEnrollments}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatMoney(Number(plan.employerCostPerPeriod) * plan.activeEnrollments)}
                    </td>
                    {canManage && (
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <Button size="sm" variant="ghost" onClick={() => startEdit(plan)}>
                            {t('Edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={deactivate.isPending && deactivate.variables === plan.id}
                            onClick={() => deactivate.mutate(plan.id)}
                          >
                            {t('Close')}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="❑"
            title={t('No benefit plans yet')}
            description={t('Add a plan, then enrol employees so the cost enters payroll')}
          />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- enrolments

function EnrollTab() {
  const queryClient = useQueryClient();
  const t = useT();
  const [employeeId, setEmployeeId] = useState('');
  const [form, setForm] = useState({ planId: '', effectiveFrom: todayIso(), effectiveTo: '' });

  const employees = useQuery({
    queryKey: qk.employees({ forBenefits: true }),
    queryFn: () => api.get<Page<EmployeeSummary>>('/employees', { query: { limit: 200 } }),
  });
  const plans = useQuery({
    queryKey: qk.benefitPlans,
    queryFn: () => api.get<BenefitPlan[]>('/benefits/plans'),
  });
  const enrollments = useQuery({
    queryKey: qk.benefitEnrollments(employeeId),
    queryFn: () => api.get<BenefitEnrollment[]>(`/benefits/enrollments/${employeeId}`),
    enabled: Boolean(employeeId),
  });

  const invalidate = () => {
    if (employeeId) {
      void queryClient.invalidateQueries({ queryKey: qk.benefitEnrollments(employeeId) });
    }
    void queryClient.invalidateQueries({ queryKey: ['benefit-plans'] });
  };

  const enroll = useMutation({
    mutationFn: () =>
      api.post('/benefits/enrollments', {
        employeeId,
        planId: form.planId,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
      }),
    onSuccess: () => {
      setForm({ planId: '', effectiveFrom: todayIso(), effectiveTo: '' });
      invalidate();
    },
  });

  const end = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/benefits/enrollments/${id}/end`, { effectiveTo: todayIso() }),
    onSuccess: invalidate,
  });

  return (
    <div className="stack">
      <Card title={t('Enrol in a benefit')}>
        <div className="stack">
          <div className="toolbar">
            <Field label={t('Employee')}>
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">{t('— Select an employee —')}</option>
                {(employees.data?.data ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstNameTh} {employee.lastNameTh} ({employee.employeeCode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Benefit plan')}>
              <Select
                value={form.planId}
                onChange={(e) => setForm({ ...form, planId: e.target.value })}
              >
                <option value="">{t('— Select a plan —')}</option>
                {(plans.data ?? []).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Effective from')}>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
              />
            </Field>
            <Field label={t('To (blank = ongoing)')}>
              <Input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
              />
            </Field>
          </div>
          <div className="row">
            <Button
              variant="primary"
              loading={enroll.isPending}
              disabled={!employeeId || !form.planId}
              onClick={() => enroll.mutate()}
            >
              {t('Enrol')}
            </Button>
          </div>
          {enroll.isError && (
            <div className="alert alert--danger" role="alert">
              {errorMessage(enroll.error, t('Could not enrol'))}
            </div>
          )}
        </div>
      </Card>

      {employeeId && (
        <Card flush>
          {enrollments.isLoading ? (
            <TableSkeleton rows={3} columns={4} />
          ) : enrollments.isError ? (
            <ErrorState error={enrollments.error} onRetry={() => void enrollments.refetch()} />
          ) : enrollments.data && enrollments.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Plan')}</th>
                    <th>{t('Dates')}</th>
                    <th>{t('Status')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {enrollments.data.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td style={{ fontWeight: 500 }}>{enrollment.plan.name}</td>
                      <td>
                        {formatDate(enrollment.effectiveFrom)} –{' '}
                        {enrollment.effectiveTo ? formatDate(enrollment.effectiveTo) : t('ongoing')}
                      </td>
                      <td>
                        <Badge tone={enrollment.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {enrollment.status === 'ACTIVE' ? t('Active') : t('Ended')}
                        </Badge>
                      </td>
                      <td>
                        {enrollment.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={end.isPending && end.variables === enrollment.id}
                            onClick={() => end.mutate(enrollment.id)}
                          >
                            {t('End')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="❑" title={t('This employee has no benefits yet')} />
          )}
        </Card>
      )}
    </div>
  );
}
