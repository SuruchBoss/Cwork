import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth.store';
import type { MfaChallenge, MfaEnrolment } from '@/types/api';

const schema = z.object({
  email: z.email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
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

  const [step, setStep] = useState<Step>({ name: 'credentials' });
  const [serverError, setServerError] = useState<string | null>(null);

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
      setServerError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
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
      setServerError(describe(error, 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่'));
    }
  });

  if (step.name === 'code') {
    return (
      <AuthShell title="ยืนยันตัวตนสองขั้นตอน" subtitle="กรอกรหัส 6 หลักจากแอป Authenticator">
        <CodeForm
          submitLabel="ยืนยัน"
          error={serverError}
          onSubmit={async (code) => {
            setServerError(null);
            try {
              await verifyMfa(step.challenge.challengeToken, code);
              goHome();
            } catch (error) {
              setServerError(describe(error, 'รหัสไม่ถูกต้อง กรุณาลองใหม่'));
            }
          }}
          onBack={() => {
            setServerError(null);
            setStep({ name: 'credentials' });
          }}
        />
        <p className="subtle" style={{ marginTop: 12 }}>
          ใช้รหัสสำรอง (recovery code) แทนได้ หากไม่มีโทรศัพท์
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
        title="เก็บรหัสสำรองไว้ให้ดี"
        subtitle="รหัสเหล่านี้แสดงเพียงครั้งเดียว ใช้ได้ครั้งละหนึ่งรหัสเมื่อไม่มีโทรศัพท์"
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
              setServerError(describe(error, 'ไม่สามารถเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่'));
            }
          }}
        >
          บันทึกแล้ว เข้าสู่ระบบ
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
            <div className="subtle">ระบบบริหารทรัพยากรบุคคล</div>
          </div>
        </div>

        <div className="stack">
          <Field label="อีเมล" error={errors.email?.message}>
            <Input
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email', { required: 'กรุณากรอกอีเมล' })}
            />
          </Field>

          <Field label="รหัสผ่าน" error={errors.password?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password', { required: 'กรุณากรอกรหัสผ่าน' })}
            />
          </Field>

          {serverError && (
            <div className="alert alert--danger" role="alert">
              {serverError}
            </div>
          )}

          <Button type="submit" variant="primary" loading={isSubmitting} style={{ width: '100%' }}>
            เข้าสู่ระบบ
          </Button>
        </div>

        {env.isDev && (
          <div className="auth__hint">
            <strong>บัญชีทดสอบ (seed):</strong>
            <br />
            hr.manager@cwork.example · eng.manager@cwork.example · dev2@cwork.example
            <br />
            รหัสผ่าน: <code className="mono">Cwork2026!</code>
            <br />
            บัญชีผู้ดูแลต้องใช้รหัส 2FA — ดูคีย์ที่ผลลัพธ์ของ <code className="mono">db:seed</code>
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
      <Field label="รหัสยืนยัน">
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
        ย้อนกลับ
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
            caught instanceof ApiError ? caught.message : 'ไม่สามารถเริ่มตั้งค่า 2FA ได้',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [challenge.challengeToken, setError]);

  return (
    <AuthShell
      title="ตั้งค่ายืนยันตัวตนสองขั้นตอน"
      subtitle="บัญชีนี้มีสิทธิ์สูง จึงต้องใช้ 2FA ก่อนเข้าใช้งาน"
    >
      <div className="stack">
        {qr ? (
          <img
            src={qr}
            alt="QR code สำหรับแอป Authenticator"
            style={{ alignSelf: 'center', borderRadius: 8 }}
            width={192}
            height={192}
          />
        ) : (
          <div className="subtle" style={{ textAlign: 'center' }}>
            กำลังเตรียม QR…
          </div>
        )}

        {enrolment && (
          <Field label="หรือกรอกคีย์นี้ในแอปด้วยตนเอง">
            <code className="mono" style={{ wordBreak: 'break-all' }}>
              {enrolment.secret}
            </code>
          </Field>
        )}

        <CodeForm
          submitLabel="เปิดใช้งาน"
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
                  caught instanceof ApiError ? caught.message : 'รหัสไม่ถูกต้อง กรุณาลองใหม่',
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
