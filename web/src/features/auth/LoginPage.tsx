// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { fetchSetupStatus } from '@/features/setup/setup.api';
import { env } from '@/lib/env';
import { useT } from '@/lib/i18n/useT';
import { useAuthStore } from '@/stores/auth.store';
import type { MfaChallenge, MfaEnrolment } from '@/types/api';

// Messages are English keys (CW-016); the form translates them through `t()`
// when it shows them.
const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(1, 'Please enter your password'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Sign-in is up to three steps: password, then a second factor, and for an
 * account that must have one but has not enrolled, the enrolment in between.
 *
 * The challenge token is held in component state only. It is not a session and
 * has no business being persisted — if the tab closes mid-enrolment, starting
 * again from the password is the correct outcome.
 */
type Step =
  | { name: 'credentials' }
  | { name: 'code'; challenge: MfaChallenge }
  | { name: 'enrol'; challenge: MfaChallenge }
  | { name: 'recovery'; challenge: MfaChallenge; codes: string[] };

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const completeMfaEnrolment = useAuthStore((s) => s.completeMfaEnrolment);
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();

  const [step, setStep] = useState<Step>({ name: 'credentials' });
  const [serverError, setServerError] = useState<string | null>(null);

  /**
   * A freshly installed Cwork has no account to sign in as, and a sign-in form
   * is a dead end for whoever just deployed it. Send them to the wizard instead.
   *
   * Deliberately does not block the form while it asks: on every install after
   * the first this check is a no-op, and making everybody wait on it to render a
   * login box would be the wrong trade.
   */
  useEffect(() => {
    let cancelled = false;
    fetchSetupStatus()
      .then((status) => {
        if (!cancelled && !status.initialised) navigate('/setup', { replace: true });
      })
      .catch(() => {
        // Unreachable API. The sign-in attempt will say so far better than a
        // banner here could.
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { email: '', password: '' } });

  if (accessToken) return <Navigate to="/" replace />;

  const goHome = (): void => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? '/', { replace: true });
  };

  const describe = (error: unknown, fallback: string): string =>
    error instanceof ApiError ? error.message : fallback;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setServerError(t(parsed.error.issues[0]?.message ?? 'The information is not valid'));
      return;
    }

    try {
      const challenge = await login(parsed.data.email, parsed.data.password);
      if (!challenge) {
        goHome();
        return;
      }
      setStep(
        challenge.mfaEnrolled
          ? { name: 'code', challenge }
          : { name: 'enrol', challenge },
      );
    } catch (error) {
      // Show the server's message: it distinguishes a locked account from bad
      // credentials, which matters for someone who is genuinely locked out.
      setServerError(describe(error, t('Could not sign in, please try again')));
    }
  });

  if (step.name === 'code') {
    return (
      <AuthShell
        title={t('Two-step verification')}
        subtitle={t('Enter the 6-digit code from your authenticator app')}
      >
        <CodeForm
          submitLabel={t('Verify')}
          error={serverError}
          onSubmit={async (code) => {
            setServerError(null);
            try {
              await verifyMfa(step.challenge.challengeToken, code);
              goHome();
            } catch (error) {
              setServerError(describe(error, t('The code is incorrect, please try again')));
            }
          }}
          onBack={() => {
            setServerError(null);
            setStep({ name: 'credentials' });
          }}
        />
        <p className="subtle" style={{ marginTop: 12 }}>
          {t('You can use a recovery code instead if you do not have your phone.')}
        </p>
      </AuthShell>
    );
  }

  if (step.name === 'enrol') {
    return (
      <EnrolStep
        challenge={step.challenge}
        error={serverError}
        setError={setServerError}
        onEnrolled={(codes) => setStep({ name: 'recovery', challenge: step.challenge, codes })}
        onBack={() => {
          setServerError(null);
          setStep({ name: 'credentials' });
        }}
      />
    );
  }

  if (step.name === 'recovery') {
    return (
      <AuthShell
        title={t('Keep your recovery codes safe')}
        subtitle={t('These codes are shown only once; use one at a time when you do not have your phone.')}
      >
        <ul className="stack mono" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {step.codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        {serverError && (
          <div className="alert alert--danger" role="alert" style={{ marginTop: 12 }}>
            {serverError}
          </div>
        )}
        <Button
          variant="primary"
          style={{ width: '100%', marginTop: 16 }}
          onClick={async () => {
            setServerError(null);
            try {
              await completeMfaEnrolment(step.challenge.challengeToken);
              goHome();
            } catch (error) {
              setServerError(describe(error, t('Could not sign in, please sign in again')));
            }
          }}
        >
          {t('Saved, sign in')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={onSubmit} noValidate>
        <div className="auth__brand">
          <span className="sidebar__logo" aria-hidden>
            CW
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{env.appName}</div>
            <div className="subtle">{t('Human resources management system')}</div>
          </div>
        </div>

        <div className="stack">
          <Field label={t('Email')} error={errors.email?.message ? t(errors.email.message) : undefined}>
            <Input
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email', { required: 'Please enter your email' })}
            />
          </Field>

          <Field
            label={t('Password')}
            error={errors.password?.message ? t(errors.password.message) : undefined}
          >
            <Input
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password', { required: 'Please enter your password' })}
            />
          </Field>

          {serverError && (
            <div className="alert alert--danger" role="alert">
              {serverError}
            </div>
          )}

          <Button type="submit" variant="primary" loading={isSubmitting} style={{ width: '100%' }}>
            {t('Sign in')}
          </Button>
        </div>

        {env.isDev && (
          <div className="auth__hint">
            <strong>{t('Test accounts (seed):')}</strong>
            <br />
            hr.manager@cwork.example · eng.manager@cwork.example · dev2@cwork.example
            <br />
            {t('Password:')} <code className="mono">Cwork2026!</code>
            <br />
            {t('Admin accounts need a 2FA code — see the key in the output of')}{' '}
            <code className="mono">db:seed</code>
          </div>
        )}
      </form>
    </main>
  );
}

/** Shared card chrome, so each step is just its own content. */
function AuthShell({
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

/**
 * Six-digit entry that also accepts a recovery code, so someone without their
 * phone is not stuck staring at a field that rejects what they have.
 */
function CodeForm({
  submitLabel,
  error,
  onSubmit,
  onBack,
}: {
  submitLabel: string;
  error: string | null;
  onSubmit: (code: string) => Promise<void>;
  onBack: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!code.trim() || busy) return;
        setBusy(true);
        try {
          await onSubmit(code.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label={t('Verification code')}>
        <Input
          // Not type="number": leading zeros matter and spinners do not help.
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>

      {error && (
        <div className="alert alert--danger" role="alert">
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" loading={busy} style={{ width: '100%' }}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack} style={{ width: '100%' }}>
        {t('Back')}
      </Button>
    </form>
  );
}

/** Secret, QR, then a code to prove the app was actually set up. */
function EnrolStep({
  challenge,
  error,
  setError,
  onEnrolled,
  onBack,
}: {
  challenge: MfaChallenge;
  error: string | null;
  setError: (message: string | null) => void;
  onEnrolled: (codes: string[]) => void;
  onBack: () => void;
}) {
  const t = useT();
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const offer = await api.post<MfaEnrolment>(
          '/auth/mfa/enroll',
          { challengeToken: challenge.challengeToken },
          { anonymous: true },
        );
        if (cancelled) return;
        setEnrolment(offer);

        // Loaded on demand: the QR encoder is dead weight for every sign-in
        // that is not an enrolment.
        const { toDataURL } = await import('qrcode');
        const dataUrl = await toDataURL(offer.otpauthUri, { margin: 1, width: 192 });
        if (!cancelled) setQr(dataUrl);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : t('Could not start 2FA setup'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [challenge.challengeToken, setError, t]);

  return (
    <AuthShell
      title={t('Set up two-step verification')}
      subtitle={t('This account is highly privileged, so it must use 2FA before first use.')}
    >
      <div className="stack">
        {qr ? (
          <img
            src={qr}
            alt={t('QR code for your authenticator app')}
            style={{ alignSelf: 'center', borderRadius: 8 }}
            width={192}
            height={192}
          />
        ) : (
          <div className="subtle" style={{ textAlign: 'center' }}>
            {t('Preparing QR…')}
          </div>
        )}

        {enrolment && (
          <Field label={t('Or enter this key in the app manually')}>
            <code className="mono" style={{ wordBreak: 'break-all' }}>
              {enrolment.secret}
            </code>
          </Field>
        )}

        <CodeForm
          submitLabel={t('Enable')}
          error={error}
          onSubmit={async (code) => {
            setError(null);
            const result = await api
              .post<{ recoveryCodes: string[] }>(
                '/auth/mfa/activate',
                { challengeToken: challenge.challengeToken, code },
                { anonymous: true },
              )
              .catch((caught: unknown) => {
                setError(
                  caught instanceof ApiError ? caught.message : t('The code is incorrect, please try again'),
                );
                return null;
              });

            if (result) onEnrolled(result.recoveryCodes);
          }}
          onBack={onBack}
        />
      </div>
    </AuthShell>
  );
}
