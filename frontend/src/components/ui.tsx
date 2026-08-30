import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { dirClass, pct } from '../lib/format';

export function Card({
  title,
  action,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={clsx('u-card flex flex-col', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[11px] uppercase tracking-wider text-fg-secondary">{title}</h2>
          {action}
        </header>
      )}
      <div className={clsx(pad && 'p-4', 'flex-1')}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: 'bull' | 'bear' | 'plain';
  className?: string;
}) {
  return (
    <div className={clsx('u-card p-3.5', className)}>
      <div className="u-label">{label}</div>
      <div
        className={clsx(
          'mt-1.5 text-xl font-semibold tnum',
          accent === 'bull' && 'text-bullish',
          accent === 'bear' && 'text-bearish',
        )}
      >
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-xs text-fg-muted tnum">{sub}</div>}
    </div>
  );
}

/** signed percent, coloured amber/violet */
export function Delta({ value, dp = 2, className }: { value: number | null; dp?: number; className?: string }) {
  return <span className={clsx('tnum', dirClass(value), className)}>{pct(value, dp)}</span>;
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'bull' | 'bear' | 'info' | 'accent' | 'highlight';
  className?: string;
}) {
  const tones: Record<string, string> = {
    muted: 'bg-border text-fg-secondary',
    bull: 'bg-bullish/15 text-bullish',
    bear: 'bg-bearish/15 text-bearish',
    info: 'bg-info/15 text-info',
    accent: 'bg-accent/15 text-accent',
    highlight: 'bg-highlight/15 text-highlight',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ label = 'loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-xs text-fg-muted">
      <span className="h-3 w-3 animate-spin rounded-full border border-border border-t-accent" />
      {label}…
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-xs text-fg-muted">{children}</div>;
}

export function ErrorNote({ error }: { error: Error }) {
  return (
    <div className="m-3 rounded border border-bearish/40 bg-bearish/10 p-3 text-xs text-bearish">
      {error.message}
    </div>
  );
}

/** Wraps a query result with standard loading / error / empty handling. */
export function Async<T>({
  q,
  children,
  empty,
}: {
  q: { data: T | undefined; error?: Error; loading: boolean };
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (q.data === undefined && q.loading) return <Spinner />;
  if (q.error && q.data === undefined) return <ErrorNote error={q.error} />;
  if (q.data === undefined) return <Empty>{empty ?? 'No data'}</Empty>;
  return <>{children(q.data)}</>;
}

/**
 * Two-step remove control: first click arms ("remove?"), second confirms.
 * `warn` is shown on the armed state (e.g. "still held in portfolio").
 */
export function RemoveButton({
  onConfirm,
  warn,
  label = '✕',
  className,
}: {
  onConfirm: () => void | Promise<void>;
  warn?: string;
  label?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1" onMouseLeave={() => setArmed(false)}>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setArmed(false);
            }
          }}
          disabled={busy}
          className="rounded bg-bearish/20 px-1.5 py-0.5 text-[10px] font-medium text-bearish hover:bg-bearish/30"
          title={warn}
        >
          {busy ? '…' : warn ? 'remove anyway' : 'remove?'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setArmed(false);
          }}
          className="text-[10px] text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setArmed(true);
      }}
      className={clsx('text-fg-muted transition-colors hover:text-bearish', className)}
      title="Remove from watchlist"
    >
      {label}
    </button>
  );
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded px-2.5 py-1 text-xs transition-colors',
        active ? 'bg-accent text-bg' : 'bg-surface text-fg-secondary hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
