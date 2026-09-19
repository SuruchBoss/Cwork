import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { useT } from '@/lib/i18n/useT';
import { completeSetup, fetchSetupStatus, type SetupResult } from './setup.api';
import { setupSchema, toSetupRequest, type SetupFormValues } from './schema';

/**
 * First-run wizard.
 *
 * Reachable only with the one-time token `npm run db:init -- --web` prints,
 * which is the whole security model: minting a token needs shell access to the
 * server, so a stranger who finds a fresh deployment cannot make themselves its
 * administrator. The page itself is therefore free to be public — it can be
 * looked at all day and does nothing without the token.
 *
 * It ends at the sign-in page rather than at a session. The account it creates
 * holds every permission, so Cwork makes it enrol a second factor before the
 * first session exists, and that flow already lives in the login page.
 */
export default function SetupPage() {
  const navigate = useNavigate();
  const t = useT();
  const [state, setState] = useState<'checking' | 'ready' | 'done'>('checking');
  const [result, setResult] = useState<SetupResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Field messages are English keys (from the schema and the required rules);
  // translate whichever one is showing.
  const fieldError = (message?: string): string | undefined =>
    message ? t(message) : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>({
    defaultValues: {
      token: '',
      organizationName: '',
      organizationCode: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
      adminEmail: '',
      adminPassword: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    let cancelled = false;
    // An install that has already been set up has no business showing this
    // form — there is nothing it could do but fail on submit.
    fetchSetupStatus()
      .then((status) => {
        if (cancelled) return;
        if (status.initialised) navigate('/login', { replace: true });
        else setState('ready');
      })
      .catch(() => {
        // The API is unreachable or broken. Show the form anyway: it is more
        // use than a dead end, and submitting will say what is wrong.
        if (!cancelled) setState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const parsed = setupSchema.safeParse(values);
    if (!parsed.success) {
      setServerError(t(parsed.error.issues[0]?.message ?? 'The information is not valid'));
      return;
    }

    try {
      setResult(await completeSetup(toSetupRequest(parsed.data)));
      setState('done');
    } catch (error) {
      // The server's own message is the useful one here: it distinguishes a
      // spent token from a weak password from an install someone else just
      // finished, and the installer needs to know which.
      setServerError(
        error instanceof ApiError ? error.message : t('Setup failed, please try again'),
      );
    }
  });

  if (state === 'checking') {
    return (
      <Shell title={t('Checking the system')} subtitle={t('One moment')}>
        <div className="row" style={{ gap: 10 }}>
          <span className="spinner" aria-hidden />
          <span className="muted">{t('Connecting to the server…')}</span>
        </div>
      </Shell>
    );
  }

  if (state === 'done' && result) {
    return (
      <Shell title={t('Setup complete')} subtitle={`${result.organization.name} (${result.organization.code})`}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {t('Created the organisation, {count} system roles and the first administrator.', {
              count: result.rolesCreated,
            })}
          </p>
          <div className="alert alert--info" role="status">
            <strong>{t('Next step')}</strong>
            <br />
            {t('Sign in with')} <code className="mono">{result.administrator.email}</code> —{' '}
            {t(
              'this account holds every permission, so the system will ask you to set up two-step verification before you start. Have your authenticator app ready.',
            )}
          </div>
          <Button
            variant="primary"
            style={{ width: '100%' }}
            onClick={() => navigate('/login', { replace: true })}
          >
            {t('Go to sign-in')}
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={t('First-time setup of {app}', { app: env.appName })} subtitle={t('Done once per installation')}>
      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field
          label={t('Setup token')}
          hint={t('From the command npm run db:init -- --web on the server')}
          error={fieldError(errors.token?.message)}
        >
          <Input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={t('Paste the token here')}
            aria-invalid={Boolean(errors.token)}
            {...register('token', { required: 'Paste the token' })}
          />
        </Field>

        <Field label={t('Organisation name')} error={fieldError(errors.organizationName?.message)}>
          <Input
            placeholder={t('Example Co., Ltd.')}
            aria-invalid={Boolean(errors.organizationName)}
            {...register('organizationName', { required: 'Please enter an organisation name' })}
          />
        </Field>

        <Field
          label={t('Short code (optional)')}
          hint={t('Used in the audit log; leave blank to derive one from the name')}
          error={fieldError(errors.organizationCode?.message)}
        >
          <Input
            placeholder="ACME"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.organizationCode)}
            {...register('organizationCode')}
          />
        </Field>

        <Field label={t('Time zone')} error={fieldError(errors.timezone?.message)}>
          <Input
            placeholder="Asia/Bangkok"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.timezone)}
            {...register('timezone', { required: 'Please provide a time zone' })}
          />
        </Field>

        <Field label={t('First administrator email')} error={fieldError(errors.adminEmail?.message)}>
          <Input
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            aria-invalid={Boolean(errors.adminEmail)}
            {...register('adminEmail', { required: 'Please enter your email' })}
          />
        </Field>

        <Field label={t('Password')} hint={t('At least 12 characters')} error={fieldError(errors.adminPassword?.message)}>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.adminPassword)}
            {...register('adminPassword', { required: 'Please enter a password' })}
          />
        </Field>

        <Field label={t('Confirm password')} error={fieldError(errors.confirmPassword?.message)}>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword', { required: 'Please enter the password again' })}
          />
        </Field>

        {serverError && (
          <div className="alert alert--danger" role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} style={{ width: '100%' }}>
          {t('Set up and create administrator')}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="sidebar__logo" aria-hidden>
            CW
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
            <div className="subtle">{subtitle}</div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
