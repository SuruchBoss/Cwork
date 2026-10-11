// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { qk } from '@/app/query-client';
import { Badge, Button, Card, DateInput, Field, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { formatDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n/useT';
import { roleLabels } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth.store';
import type { AccountRoleGrant, AccountRoles, GrantableRole } from '@/types/api';

type T = ReturnType<typeof useT>;

function roleLabel(key: string, t: T): string {
  return t(roleLabels[key] ?? key);
}

/**
 * The roles of an employee's account (CW-079), for someone with `role:manage`.
 * Giving or taking away a role signs the account out of every device, so the
 * change applies at once and a role needing two-factor sign-in has it set up
 * at the next sign-in.
 */
export function AccountRolesCard({ employeeId }: { employeeId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const data = useQuery({
    queryKey: qk.accountRoles(employeeId),
    queryFn: () => api.get<AccountRoles>(`/employees/${employeeId}/roles`),
  });

  const changed = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: qk.accountRoles(employeeId) });
    // Changing your own roles does not sign you out; pick up the new permissions.
    if (data.data?.isSelf) await refreshUser();
    setNotice(message);
  };

  const remove = useMutation({
    mutationFn: (grantId: string) => api.delete(`/employees/${employeeId}/roles/${grantId}`),
    onSuccess: (_, grantId) => {
      const grant = data.data?.grants.find((g) => g.id === grantId);
      return changed(
        t('{role} removed.', { role: grant ? roleLabel(grant.roleKey, t) : '' }) +
          (data.data?.isSelf ? '' : ` ${t('They have been signed out of every device.')}`),
      );
    },
    onError: (error) => setProblem(roleError(error, t)),
  });

  const roles = data.data?.roles ?? [];
  const byKey = new Map(roles.map((role) => [role.key, role]));
  const account = data.data?.account ?? null;

  return (
    <Card
      title={t('Account roles')}
      actions={
        account && !adding && roles.some((role) => role.grantable) ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNotice(null);
              setProblem(null);
              setAdding(true);
            }}
          >
            {t('Give a role')}
          </Button>
        ) : undefined
      }
    >
      {data.isLoading ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('Loading')}
        </p>
      ) : data.isError ? (
        <div className="alert alert--danger" role="alert">
          {t('Could not load the roles.')}
        </div>
      ) : !account ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('This employee has no account, so there is nothing to give a role to.')}
        </p>
      ) : (
        <div className="stack stack--sm">
          {notice && (
            <div className="alert alert--success" role="status">
              {notice}
            </div>
          )}
          {problem && !adding && (
            <div className="alert alert--danger" role="alert">
              {problem}
            </div>
          )}
          {data.data!.grants.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t('No roles. This account can sign in but do nothing.')}
            </p>
          ) : (
            <ul className="stack stack--sm" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {data.data!.grants.map((grant) => (
                <GrantRow
                  key={grant.id}
                  grant={grant}
                  canRemove={byKey.get(grant.roleKey)?.grantable ?? false}
                  removing={remove.isPending && remove.variables === grant.id}
                  onRemove={() => {
                    setNotice(null);
                    setProblem(null);
                    const role = roleLabel(grant.roleKey, t);
                    const question = data.data!.isSelf
                      ? t('Remove {role} from your own account?', { role })
                      : t('Remove {role} from {email}? They will be signed out of every device.', {
                          role,
                          email: account.email,
                        });
                    if (window.confirm(question)) remove.mutate(grant.id);
                  }}
                />
              ))}
            </ul>
          )}
          {adding && (
            <GrantForm
              employeeId={employeeId}
              roles={roles.filter((role) => role.grantable)}
              mfaEnabled={account.mfaEnabled}
              isSelf={data.data!.isSelf}
              onSaved={(message) => {
                setAdding(false);
                return changed(message);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function GrantRow({
  grant,
  canRemove,
  removing,
  onRemove,
}: {
  grant: AccountRoleGrant;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <li className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <strong>{roleLabel(grant.roleKey, t)}</strong>
        {grant.department && (
          <Badge tone="neutral">
            {t('Only {department}', { department: grant.department.name })}
          </Badge>
        )}
        {grant.expired ? (
          <Badge tone="warning">{t('Expired')}</Badge>
        ) : (
          grant.expiresOn && (
            <span className="muted">
              {t('until {date}', { date: formatDate(grant.expiresOn) })}
            </span>
          )
        )}
      </span>
      {canRemove && (
        <Button size="sm" variant="ghost" loading={removing} onClick={onRemove}>
          {t('Remove role')}
        </Button>
      )}
    </li>
  );
}

function GrantForm({
  employeeId,
  roles,
  mfaEnabled,
  isSelf,
  onSaved,
  onCancel,
}: {
  employeeId: string;
  roles: GrantableRole[];
  mfaEnabled: boolean;
  isSelf: boolean;
  onSaved: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [roleKey, setRoleKey] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const role = roles.find((r) => r.key === roleKey) ?? null;

  const departments = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/departments'),
    enabled: role?.departmentScopeApplies ?? false,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ signedOut: boolean; secondFactorRequired: boolean }>(
        `/employees/${employeeId}/roles`,
        body,
      ),
    onSuccess: (result) => {
      const label = roleLabel(roleKey, t);
      const parts = [t('{role} given.', { role: label })];
      if (result.signedOut) parts.push(t('They have been signed out of every device.'));
      if (result.secondFactorRequired) {
        parts.push(t('They will set up two-factor sign-in when they next sign in.'));
      }
      return onSaved(parts.join(' '));
    },
    onError: (error) => setProblem(roleError(error, t)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (!role) return setProblem(t('Choose a role.'));
    save.mutate({
      roleKey: role.key,
      ...(role.departmentScopeApplies && departmentId ? { departmentId } : {}),
      ...(expiresOn ? { expiresOn } : {}),
    });
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <Field label={t('Role')}>
          <Select autoFocus value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            <option value="">{t('Choose a role')}</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {roleLabel(r.key, t)}
              </option>
            ))}
          </Select>
        </Field>
        {role?.departmentScopeApplies && (
          <Field
            label={t('Department')}
            hint={t('Limit it to one department: they see only its employees.')}
          >
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">{t('Every department')}</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('Last day (optional)')} hint={t('Leave empty for no end.')}>
          <DateInput value={expiresOn} onChange={setExpiresOn} min={todayIso()} />
        </Field>
      </div>
      {role?.requiresSecondFactor && !mfaEnabled && (
        <div className="alert alert--warning" role="status">
          {t(
            'This role can see national IDs, move money or hand out roles, so it needs two-factor sign-in. They will be asked to set it up when they next sign in.',
          )}
        </div>
      )}
      {!isSelf && (
        <p className="muted" style={{ margin: 0 }}>
          {t('They will be signed out of every device, so the change applies at once.')}
        </p>
      )}
      {problem && (
        <div className="alert alert--danger" role="alert">
          {problem}
        </div>
      )}
      <div className="row">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('Give role')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}

function roleError(error: unknown, t: T): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ROLE_ALREADY_GRANTED':
        return t('The account already holds this role.');
      case 'ROLE_ABOVE_YOUR_OWN':
        return t('You can only give or take away a role whose permissions you hold yourself.');
      case 'LAST_SUPER_ADMIN':
        return t('This is the last system administrator. Make someone else one first.');
      case 'CANNOT_REMOVE_OWN_ROLE_MANAGE':
        return t('You cannot take away your own right to manage roles.');
      case 'ROLE_EXPIRY_IN_PAST':
        return t('The last day has already passed.');
      case 'DEPARTMENT_SCOPE_NOT_APPLICABLE':
        return t('This role cannot be limited to a department.');
      case 'ACCOUNT_DISABLED':
        return t('This account is disabled.');
    }
  }
  return error instanceof Error ? error.message : t('Could not save');
}
