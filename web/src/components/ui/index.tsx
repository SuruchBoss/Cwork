import clsx from 'clsx';
import { Children, cloneElement, isValidElement, useId } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ApiError } from '@/lib/api-error';
import { useT } from '@/lib/i18n/useT';

/** Small, unstyled-by-convention primitives. Styling lives in styles/app.css. */

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  flush = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__header">
          {title && <h2 className="card__title">{title}</h2>}
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={clsx('card__body', flush && 'card__body--flush')}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

/**
 * A labelled control. The label is bound to its input rather than left floating
 * beside it: without that binding a screen reader reads the input as unnamed and
 * axe flags it, and clicking the label does not focus the field. The single
 * child control is cloned to receive the generated `id` (unless it already has
 * one) and to point `aria-describedby` at the hint or error text, so every form
 * that goes through `Field` is accessible without touching the call sites.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  let control = children;
  let controlId: string | undefined;

  const only = Children.count(children) === 1 ? children : null;
  if (isValidElement(only)) {
    const el = only as ReactElement<Record<string, unknown>>;
    controlId = (el.props.id as string | undefined) ?? autoId;
    const existingDescribedBy = el.props['aria-describedby'] as string | undefined;
    control = cloneElement(el, {
      id: controlId,
      'aria-describedby': [existingDescribedBy, describedBy].filter(Boolean).join(' ') || undefined,
      ...(error ? { 'aria-invalid': true } : {}),
    });
  }

  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={controlId}>
          {label}
        </label>
      )}
      {control}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : (
        hint && (
          <span className="field__hint" id={hintId}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('input', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('select', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('textarea', props.className)} />;
}

export function Avatar({ name, size = 'md' }: { name: string | null | undefined; size?: 'md' | 'lg' }) {
  const label = (name ?? '?').trim();
  const parts = label.split(/\s+/);
  const text =
    parts.length > 1 ? `${parts[0][0] ?? ''}${parts[1][0] ?? ''}` : label.slice(0, 2) || '?';
  return (
    <span className={clsx('avatar', size === 'lg' && 'avatar--lg')} aria-hidden>
      {text.toUpperCase()}
    </span>
  );
}

export function Person({
  name,
  meta,
}: {
  name: string;
  meta?: ReactNode;
}) {
  return (
    <div className="person">
      <Avatar name={name} />
      <div style={{ minWidth: 0 }}>
        <div className="person__name">{name}</div>
        {meta && <div className="person__meta truncate">{meta}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = '◌',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        {icon}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {description && <p style={{ marginTop: 4 }}>{description}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="stack stack--sm" style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="row" style={{ gap: 12 }}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <div key={colIndex} className="skeleton" style={{ flex: colIndex === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Renders a failed query in a way the user can act on: the server's message
 * plus the request id, which is what support needs to find it in the logs.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message ?? (error instanceof Error ? error.message : t('Something went wrong'));

  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden>
        ⚠
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{message}</div>
      {apiError?.code && <p className="mono subtle">{apiError.code}</p>}
      {apiError?.requestId && <p className="mono subtle">request: {apiError.requestId}</p>}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button onClick={onRetry}>{t('Try again')}</Button>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, max = 100 }: { value: number; max?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page__header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page__actions">{actions}</div>}
    </header>
  );
}
