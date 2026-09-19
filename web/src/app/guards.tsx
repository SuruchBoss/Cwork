import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Route guards mirror the server's permissions so the console never renders a
 * screen the API would refuse. The server remains the enforcement point — this
 * only avoids showing a dead end.
 */
export function RequireAuth() {
  const { accessToken, user, isBootstrapping } = useAuthStore();
  const location = useLocation();
  const t = useT();

  if (isBootstrapping) {
    return (
      <div className="auth">
        <div className="row" style={{ gap: 10 }}>
          <span className="spinner" aria-hidden />
          <span className="muted">{t('Checking permissions')}…</span>
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
  const t = useT();

  if (!canAny(...any)) {
    return (
      <div className="page">
        <EmptyState
          icon="⊘"
          title={t('You do not have access to this page')}
          description={t('If you think this is a mistake, contact your administrator')}
        />
      </div>
    );
  }

  return <Outlet />;
}
