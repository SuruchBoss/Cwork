import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
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
  const [state, setState] = useState<'checking' | 'ready' | 'done'>('checking');
  const [result, setResult] = useState<SetupResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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
      setServerError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
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
        error instanceof ApiError ? error.message : 'ตั้งค่าไม่สำเร็จ กรุณาลองใหม่',
      );
    }
  });

  if (state === 'checking') {
    return (
      <Shell title="กำลังตรวจสอบระบบ" subtitle="รอสักครู่">
        <div className="row" style={{ gap: 10 }}>
          <span className="spinner" aria-hidden />
          <span className="muted">กำลังเชื่อมต่อเซิร์ฟเวอร์…</span>
        </div>
      </Shell>
    );
  }

  if (state === 'done' && result) {
    return (
      <Shell title="ตั้งค่าเรียบร้อย" subtitle={`${result.organization.name} (${result.organization.code})`}>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            สร้างองค์กร บทบาทระบบ {result.rolesCreated} บทบาท และผู้ดูแลคนแรกเรียบร้อยแล้ว
          </p>
          <div className="alert alert--info" role="status">
            <strong>ขั้นต่อไป</strong>
            <br />
            เข้าสู่ระบบด้วย <code className="mono">{result.administrator.email}</code> —
            บัญชีนี้มีสิทธิ์ทั้งหมด ระบบจึงจะให้ตั้งค่ายืนยันตัวตนสองขั้นตอนก่อนเริ่มใช้งาน
            เตรียมแอป Authenticator ไว้ให้พร้อม
          </div>
          <Button
            variant="primary"
            style={{ width: '100%' }}
            onClick={() => navigate('/login', { replace: true })}
          >
            ไปหน้าเข้าสู่ระบบ
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`ตั้งค่า ${env.appName} ครั้งแรก`} subtitle="ทำเพียงครั้งเดียวต่อการติดตั้งหนึ่งชุด">
      <form className="stack" onSubmit={onSubmit} noValidate>
        <Field
          label="โทเคนตั้งค่า"
          hint="ได้จากคำสั่ง npm run db:init -- --web บนเครื่องเซิร์ฟเวอร์"
          error={errors.token?.message}
        >
          <Input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="วางโทเคนที่นี่"
            aria-invalid={Boolean(errors.token)}
            {...register('token', { required: 'กรุณาวางโทเคน' })}
          />
        </Field>

        <Field label="ชื่อองค์กร" error={errors.organizationName?.message}>
          <Input
            placeholder="บริษัท ตัวอย่าง จำกัด"
            aria-invalid={Boolean(errors.organizationName)}
            {...register('organizationName', { required: 'กรุณากรอกชื่อองค์กร' })}
          />
        </Field>

        <Field
          label="รหัสย่อ (ไม่บังคับ)"
          hint="ใช้ในบันทึกระบบ เว้นว่างไว้ให้ระบบตั้งให้จากชื่อองค์กร"
          error={errors.organizationCode?.message}
        >
          <Input
            placeholder="ACME"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.organizationCode)}
            {...register('organizationCode')}
          />
        </Field>

        <Field label="เขตเวลา" error={errors.timezone?.message}>
          <Input
            placeholder="Asia/Bangkok"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.timezone)}
            {...register('timezone', { required: 'กรุณาระบุเขตเวลา' })}
          />
        </Field>

        <Field label="อีเมลผู้ดูแลคนแรก" error={errors.adminEmail?.message}>
          <Input
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            aria-invalid={Boolean(errors.adminEmail)}
            {...register('adminEmail', { required: 'กรุณากรอกอีเมล' })}
          />
        </Field>

        <Field label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร" error={errors.adminPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.adminPassword)}
            {...register('adminPassword', { required: 'กรุณากรอกรหัสผ่าน' })}
          />
        </Field>

        <Field label="ยืนยันรหัสผ่าน" error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register('confirmPassword', { required: 'กรุณากรอกรหัสผ่านอีกครั้ง' })}
          />
        </Field>

        {serverError && (
          <div className="alert alert--danger" role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" variant="primary" loading={isSubmitting} style={{ width: '100%' }}>
          ตั้งค่าและสร้างผู้ดูแล
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
