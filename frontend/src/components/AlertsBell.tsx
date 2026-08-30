import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useAlerts } from '../lib/hooks';
import { invalidate } from '../lib/useApi';
import { api } from '../lib/api';
import { ago, num } from '../lib/format';
import type { PriceAlert } from '../lib/types';

const SEEN_KEY = 'inv:alertsSeen';

function loadSeen(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as number[]);
  } catch {
    return new Set();
  }
}
function saveSeen(ids: Set<number>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* private mode */
  }
}

/** In the desktop app the Electron main process owns background notifications. */
const IS_ELECTRON = /electron/i.test(navigator.userAgent);

/** Fire a native desktop notification (browser build) per fresh alert. */
function notify(alerts: PriceAlert[]): void {
  if (IS_ELECTRON) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  for (const a of alerts) {
    const verb = a.kind === 'target' ? 'hit target' : 'hit stop-loss';
    new Notification(`${a.ticker} ${verb}`, {
      body: `${num(a.price)} ${a.currency ?? ''} · ${a.kind === 'target' ? '≥' : '≤'} ${num(a.threshold)}`,
      tag: `inv-alert-${a.id}`,
    });
  }
}

export function AlertsBell() {
  const { data } = useAlerts();
  const [open, setOpen] = useState(false);
  const seen = useRef(loadSeen());
  const alerts = data?.alerts ?? [];
  const unacked = data?.unacked ?? 0;

  // Desktop notification for alert ids we haven't seen before.
  useEffect(() => {
    if (!data) return;
    const fresh = alerts.filter((a) => !seen.current.has(a.id));
    if (fresh.length === 0) return;
    notify(fresh);
    fresh.forEach((a) => seen.current.add(a.id));
    saveSeen(seen.current);
  }, [data, alerts]);

  const ack = async (id?: number) => {
    await api.post('/alerts/ack', id ? { id } : { all: true });
    invalidate('/alerts');
  };

  const toggle = () => {
    setOpen((v) => !v);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative rounded border border-border px-2 py-1 text-xs text-fg-secondary hover:text-fg"
        title="Price alerts"
      >
        🔔
        {unacked > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-bearish px-1 text-[10px] font-semibold text-bg">
            {unacked}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-50 w-80 rounded border border-border bg-bg shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] uppercase tracking-wider text-fg-secondary">
                Price alerts
              </span>
              {unacked > 0 && (
                <button onClick={() => ack()} className="text-[11px] text-fg-muted hover:text-fg">
                  mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-xs text-fg-muted">
                  No alerts yet. Set a target or stop-loss on a holding to arm one.
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {alerts.map((a) => (
                    <li
                      key={a.id}
                      className={clsx(
                        'flex items-start gap-2 px-3 py-2 text-xs',
                        !a.acked_at && 'bg-surface/60',
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-0.5 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium',
                          a.kind === 'target'
                            ? 'bg-bullish/15 text-bullish'
                            : 'bg-bearish/15 text-bearish',
                        )}
                      >
                        {a.kind === 'target' ? 'TARGET' : 'STOP'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-accent">{a.ticker}</span>
                          <span className="text-fg-secondary">
                            {num(a.price)} {a.currency ?? ''}
                          </span>
                          {a.cleared_at && <span className="text-fg-muted">· re-armed</span>}
                        </div>
                        <div className="text-fg-muted">
                          {a.kind === 'target' ? '≥' : '≤'} {num(a.threshold)} · {ago(a.triggered_at)}
                        </div>
                      </div>
                      {!a.acked_at && (
                        <button
                          onClick={() => ack(a.id)}
                          className="mt-0.5 text-[11px] text-fg-muted hover:text-fg"
                          title="Mark read"
                        >
                          ✓
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
