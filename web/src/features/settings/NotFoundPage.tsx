import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="page">
      <EmptyState
        icon="◌"
        title={t('Page not found')}
        description={t('The link may have changed, or you may not have access to this section')}
        action={
          <Link to="/" className="btn btn--primary btn--sm">
            {t('Back to home')}
          </Link>
        }
      />
    </div>
  );
}
