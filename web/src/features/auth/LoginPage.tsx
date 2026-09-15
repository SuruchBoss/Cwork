import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth.store';

const schema = z.object({
  email: z.email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const accessToken = useAuthStore((s) => s.accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { email: '', password: '' } });

  if (accessToken) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
      return;
    }

    try {
      await login(parsed.data.email, parsed.data.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    } catch (error) {
      // Show the server's message: it distinguishes a locked account from bad
      // credentials, which matters for someone who is genuinely locked out.
      setServerError(
        error instanceof ApiError ? error.message : 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่',
      );
    }
  });

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
          </div>
        )}
      </form>
    </main>
  );
}
