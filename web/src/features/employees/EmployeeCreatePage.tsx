// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { qk } from '@/app/query-client';
import { Button, Card, DateInput, Field, Input, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { useT } from '@/lib/i18n/useT';
import type { EmployeeDetail, EmployeeSummary, Page } from '@/types/api';
import { buildBody, emptyForm } from './new-employee';
import type { FieldProblem, NewEmployeeForm, Problems } from './new-employee';

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] as const;
const MARITAL = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'UNDISCLOSED'] as const;
const TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'OUTSOURCE', 'DAILY'] as const;

/**
 * Adding one person from the console (CW-065): the same fields and checks as
 * the spreadsheet import, through the same route, so a typed national ID or
 * bank account is stored encrypted exactly as an imported one is.
 */
export default function EmployeeCreatePage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NewEmployeeForm>(emptyForm);
  const [problems, setProblems] = useState<Problems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerTerm, setManagerTerm] = useState('');

  const set = (key: keyof NewEmployeeForm) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProblems((current) => ({ ...current, [key]: undefined }));
  };
  const field = (key: keyof NewEmployeeForm) => ({
    value: form[key],
    onChange: (event: { target: { value: string } }) => set(key)(event.target.value),
  });

  const departments = useQuery({
    queryKey: qk.departments,
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/departments'),
  });
  const positions = useQuery({
    queryKey: qk.positions,
    queryFn: () => api.get<Array<{ id: string; title: string }>>('/positions'),
  });
  const locations = useQuery({
    queryKey: qk.workLocations,
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/work-locations'),
  });

  useEffect(() => {
    const timer = setTimeout(() => setManagerTerm(managerSearch.trim()), 250);
    return () => clearTimeout(timer);
  }, [managerSearch]);
  const managers = useQuery({
    queryKey: qk.employees({ search: managerTerm, limit: 8, for: 'new-employee-manager' }),
    queryFn: () =>
      api.get<Page<EmployeeSummary>>('/employees', { query: { search: managerTerm, limit: 8 } }),
    enabled: managerTerm.length > 0,
  });

  const reason = (problem: FieldProblem | undefined): string | undefined => {
    switch (problem) {
      case undefined:
        return undefined;
      case 'NAME_NEEDED':
        return t('A name is needed, in Thai or in English');
      case 'REQUIRED':
        return t('Required');
      case 'INVALID_NATIONAL_ID':
        return t('A national ID is 13 digits. Dashes and spaces are fine.');
      case 'INVALID_PASSPORT':
        return t('A passport number is 5 to 20 English letters and digits.');
      case 'INVALID_EMAIL':
        return t('This is not an email address');
      case 'PROBATION_BEFORE_HIRE':
        return t('The probation cannot end before the hire date');
      case 'BANK_INCOMPLETE':
        return t('Give the bank code, the bank and the account number, or none of them');
      case 'INVALID_BANK_CODE':
        return t('A bank code is 3 digits, for example 014');
      case 'INVALID_ACCOUNT_NO':
        return t('An account number is 6 to 20 digits');
      case 'SPACE_IN_SCANNER_NUMBER':
        return t('A scanner number has no spaces.');
    }
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<EmployeeDetail>('/employees', body),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      navigate(`/employees/${created.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'DUPLICATE_EMPLOYEE_CODE') {
        setProblems({});
        setFailure(
          t('This employee code is already used. Leave it empty to number automatically.'),
        );
      } else if (error instanceof ApiError && error.code === 'DUPLICATE_SCANNER_ID') {
        setFailure(t('This scanner number already belongs to another employee.'));
      } else if (error instanceof ApiError && error.code === 'PROBATION_BEFORE_HIRE') {
        setFailure(t('The probation cannot end before the hire date'));
      } else {
        setFailure(error instanceof Error ? error.message : t('Could not save'));
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const built = buildBody(form);
    if ('problems' in built) {
      setProblems(built.problems);
      setFailure(t('Some fields need another look. They are marked below.'));
      return;
    }
    setProblems({});
    create.mutate(built.body);
  };

  const errorOf = (key: keyof NewEmployeeForm) => reason(problems[key]);
  const people = managers.data?.data ?? [];
  const chosenManager = people.find((p) => p.id === form.managerId);

  return (
    <div className="stack">
      <PageHeader
        title={t('Add an employee')}
        description={t('One person. For many at once, import a spreadsheet instead.')}
        actions={
          <Link to="/employees" className="btn btn--secondary">
            {t('Back to the directory')}
          </Link>
        }
      />
      <form className="stack" onSubmit={submit} noValidate>
        <Card title={t('Name and basics')}>
          <Row>
            <Field label={t('Title')}>
              <Input {...field('titleTh')} maxLength={20} autoFocus />
            </Field>
            <Field label={t('First name (Thai)')} error={errorOf('firstNameTh')}>
              <Input {...field('firstNameTh')} maxLength={80} />
            </Field>
            <Field label={t('Last name (Thai)')} error={errorOf('lastNameTh')}>
              <Input {...field('lastNameTh')} maxLength={80} />
            </Field>
          </Row>
          <Row>
            <Field label={t('First name (English)')}>
              <Input {...field('firstNameEn')} maxLength={80} />
            </Field>
            <Field label={t('Last name (English)')}>
              <Input {...field('lastNameEn')} maxLength={80} />
            </Field>
            <Field label={t('Nickname')}>
              <Input {...field('nickname')} maxLength={40} />
            </Field>
          </Row>
          <Row>
            <Field label={t('Employee code')} hint={t('Leave empty to number automatically')}>
              <Input {...field('employeeCode')} maxLength={32} autoComplete="off" />
            </Field>
            <Field label={t('Date of birth')}>
              <DateInput value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </Field>
            <Field label={t('Gender')}>
              <Select {...field('gender')}>
                <option value="">{t('Not given')}</option>
                {GENDERS.map((value) => (
                  <option key={value} value={value}>
                    {t(GENDER_LABEL[value])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Marital status')}>
              <Select {...field('maritalStatus')}>
                <option value="">{t('Not given')}</option>
                {MARITAL.map((value) => (
                  <option key={value} value={value}>
                    {t(MARITAL_LABEL[value])}
                  </option>
                ))}
              </Select>
            </Field>
          </Row>
        </Card>

        <Card title={t('Work')}>
          <Row>
            <Field label={t('Hire date')} error={errorOf('hireDate')}>
              <DateInput value={form.hireDate} onChange={set('hireDate')} />
            </Field>
            <Field label={t('Probation end date')} error={errorOf('probationEndDate')}>
              <DateInput value={form.probationEndDate} onChange={set('probationEndDate')} />
            </Field>
            <Field label={t('Employment type')}>
              <Select {...field('employmentType')}>
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(TYPE_LABEL[value])}
                  </option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label={t('Department')}>
              <Select {...field('departmentId')}>
                <option value="">{t('Not given')}</option>
                {(departments.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Position')}>
              <Select {...field('positionId')}>
                <option value="">{t('Not given')}</option>
                {(positions.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Work location')}>
              <Select {...field('workLocationId')}>
                <option value="">{t('Not given')}</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field
              label={t('Find a manager')}
              hint={
                chosenManager
                  ? `${chosenManager.employeeCode} · ${chosenManager.firstNameTh} ${chosenManager.lastNameTh}`
                  : t('Search by name or code, then choose')
              }
            >
              <Input
                type="search"
                value={managerSearch}
                onChange={(event) => {
                  setManagerSearch(event.target.value);
                  set('managerId')('');
                }}
              />
            </Field>
            {people.length > 0 && (
              <Field label={t('Manager')}>
                <Select {...field('managerId')}>
                  <option value="">{t('Choose…')}</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.employeeCode} · {person.firstNameTh} {person.lastNameTh}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={t('Scanner number')} error={errorOf('scannerId')}>
              <Input {...field('scannerId')} maxLength={32} autoComplete="off" className="mono" />
            </Field>
          </Row>
        </Card>

        <Card title={t('Identity documents')}>
          <Row>
            <Field label={t('National ID')} error={errorOf('nationalId')}>
              <Input {...field('nationalId')} autoComplete="off" className="mono" />
            </Field>
            <Field label={t('Tax ID')}>
              <Input {...field('taxId')} maxLength={32} autoComplete="off" className="mono" />
            </Field>
            <Field label={t('Social security no.')}>
              <Input
                {...field('socialSecurityNo')}
                maxLength={32}
                autoComplete="off"
                className="mono"
              />
            </Field>
          </Row>
          <Row>
            <Field label={t('Passport no.')} error={errorOf('passportNo')}>
              <Input {...field('passportNo')} maxLength={30} autoComplete="off" className="mono" />
            </Field>
            <Field label={t('Passport expiry')}>
              <DateInput value={form.passportExpiresOn} onChange={set('passportExpiresOn')} />
            </Field>
            <Field label={t('Work permit no.')}>
              <Input
                {...field('workPermitNo')}
                maxLength={32}
                autoComplete="off"
                className="mono"
              />
            </Field>
            <Field label={t('Work permit expiry')}>
              <DateInput value={form.workPermitExpiresOn} onChange={set('workPermitExpiresOn')} />
            </Field>
          </Row>
          <p className="muted" style={{ margin: 0 }}>
            {t('These numbers are stored encrypted.')}
          </p>
        </Card>

        <Card title={t('Contact')}>
          <Row>
            <Field label={t('Work email')} error={errorOf('workEmail')}>
              <Input {...field('workEmail')} type="email" autoComplete="off" />
            </Field>
            <Field label={t('Personal email')} error={errorOf('personalEmail')}>
              <Input {...field('personalEmail')} type="email" autoComplete="off" />
            </Field>
            <Field label={t('Phone')}>
              <Input {...field('phone')} inputMode="tel" autoComplete="off" />
            </Field>
          </Row>
          <Row>
            <Field label={t('Address')}>
              <Input {...field('addressLine')} maxLength={255} />
            </Field>
            <Field label={t('Province')}>
              <Input {...field('province')} maxLength={80} />
            </Field>
            <Field label={t('Postal code')}>
              <Input {...field('postalCode')} maxLength={10} inputMode="numeric" />
            </Field>
          </Row>
        </Card>

        <Card title={t('Pay by transfer')}>
          <Row>
            <Field label={t('Bank code')} error={errorOf('bankCode')}>
              <Input {...field('bankCode')} maxLength={3} inputMode="numeric" className="mono" />
            </Field>
            <Field label={t('Bank')} error={errorOf('bankName')}>
              <Input {...field('bankName')} maxLength={80} />
            </Field>
            <Field label={t('Account number')} error={errorOf('bankAccountNo')}>
              <Input
                {...field('bankAccountNo')}
                inputMode="numeric"
                autoComplete="off"
                className="mono"
              />
            </Field>
            <Field label={t('Account name')} hint={t('Leave empty to use the employee’s name')}>
              <Input {...field('bankAccountName')} maxLength={120} />
            </Field>
          </Row>
          <p className="muted" style={{ margin: 0 }}>
            {t('Leave all of these empty for someone who is paid in cash.')}
          </p>
        </Card>

        {failure && (
          <div className="alert alert--danger" role="alert">
            {failure}
          </div>
        )}
        <div className="row">
          <Button type="submit" variant="primary" loading={create.isPending}>
            {t('Add employee')}
          </Button>
          <Link to="/employees" className="btn btn--ghost">
            {t('Cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="toolbar" style={{ alignItems: 'flex-start' }}>
      {children}
    </div>
  );
}

const GENDER_LABEL: Record<(typeof GENDERS)[number], string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  UNDISCLOSED: 'Prefer not to say',
};
const MARITAL_LABEL: Record<(typeof MARITAL)[number], string> = {
  SINGLE: 'Single',
  MARRIED: 'Married',
  DIVORCED: 'Divorced',
  WIDOWED: 'Widowed',
  UNDISCLOSED: 'Prefer not to say',
};
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
  OUTSOURCE: 'Outsourced',
  DAILY: 'Daily-paid',
};
