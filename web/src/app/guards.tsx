import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Route guards mirror the server's permissions so the console never renders a
 * screen the API would refuse. The server remains the enforcement point — this
 * only avoids showing a dead end.
 */
export function RequireAuth() {
  const { accessToken, user, isBootstrapping } = useAuthStore();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div className="auth">
        <div className="row" style={{ gap: 10 }}>
          <span className="spinner" aria-hidden />
          <span className="muted">กำลังตรวจสอบสิทธิ์…</span>
        </div>
      </div>
    );
  }

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function RequirePermission({ any }: { any: string[] }) {
  const canAny = useAuthStore((s) => s.canAny);

  if (!canAny(...any)) {
    return (
      <div className="page">
        <EmptyState
          icon="⊘"
          title="คุณไม่มีสิทธิ์เข้าถึงหน้านี้"
          description="หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ"
        />
      </div>
    );
  }

  return <Outlet />;
}
