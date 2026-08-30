import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { AddModal } from './components/AddModal';
import { AlertsBell } from './components/AlertsBell';
import { invalidate } from './lib/useApi';
import { api } from './lib/api';
import { ymd } from './lib/format';
import { isTwMarketOpen } from './lib/market';

const AUTO_REFRESH_KEY = 'inv:lastAutoRefresh';
const AUTO_REFRESH_MIN_GAP = 5 * 60_000; // don't auto-refresh more than once per 5 min
const QUOTE_POLL_MS = 60_000; // during TW market hours, pull fresh prices this often

const TABS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/news', label: 'News' },
  { to: '/macro', label: 'Macro' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/calendar', label: 'Calendar' },
];

const AddCtx = createContext<() => void>(() => {});
export const useAdd = () => useContext(AddCtx);

export default function App() {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(AUTO_REFRESH_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const autoRan = useRef(false);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await api.post('/refresh', {});
    } catch {
      /* endpoint still returns partial results on job failures */
    } finally {
      invalidate('/watchlist');
      invalidate('/markets');
      invalidate('/portfolio');
      invalidate('/taiwan');
      invalidate('/news');
      invalidate('/alerts');
      const now = Date.now();
      setUpdatedAt(now);
      try {
        localStorage.setItem(AUTO_REFRESH_KEY, String(now));
      } catch {
        /* private mode */
      }
      setRefreshing(false);
    }
  };

  // No backend scheduler: pull fresh data once when the dashboard is opened,
  // throttled so reloads / multiple tabs don't hammer the upstream APIs.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    let last = 0;
    try {
      last = Number(localStorage.getItem(AUTO_REFRESH_KEY)) || 0;
    } catch {
      /* ignore */
    }
    if (Date.now() - last > AUTO_REFRESH_MIN_GAP) void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // During Taiwan market hours, poll a cheap quotes-only refresh so prices move
  // on their own. The useApi pollers pick up the new rows on their next cycle;
  // we also invalidate so the change shows immediately.
  useEffect(() => {
    const tick = async () => {
      if (document.hidden || !isTwMarketOpen()) return;
      try {
        await api.post('/refresh/quotes', {});
        invalidate('/watchlist');
        invalidate('/markets');
        invalidate('/portfolio');
        setUpdatedAt(Date.now());
      } catch {
        /* transient upstream failure — try again next tick */
      }
    };
    const timer = setInterval(tick, QUOTE_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <AddCtx.Provider value={() => setAddOpen(true)}>
      <div className="min-h-screen bg-bg text-fg">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5">
            <div className="flex items-center gap-2 font-semibold tracking-widest">
              <span className="text-accent">▌</span>投資終端
            </div>
            <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    clsx(
                      'whitespace-nowrap rounded px-2.5 py-1 text-xs uppercase tracking-wide transition-colors',
                      isActive
                        ? 'bg-surface text-fg'
                        : 'text-fg-muted hover:text-fg-secondary',
                    )
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
            <span
              className="hidden whitespace-nowrap text-[11px] tabular-nums text-fg-muted sm:inline"
              title="Latest data refresh"
            >
              更新 {ymd(updatedAt)}
            </span>
            <AlertsBell />
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="rounded border border-border px-2 py-1 text-xs text-fg-secondary hover:text-fg disabled:opacity-50"
              title="Refresh all data"
            >
              {refreshing ? '↻…' : '↻ refresh'}
            </button>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                clsx('rounded px-2 py-1 text-xs', isActive ? 'text-fg' : 'text-fg-muted hover:text-fg')
              }
            >
              ⚙
            </NavLink>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5 pb-24">
          <Outlet />
        </main>

        <button
          onClick={() => setAddOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl text-bg shadow-lg shadow-accent/30 transition-transform hover:scale-105"
          title="Add ticker (⌘K)"
        >
          ＋
        </button>

        <AddModal open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </AddCtx.Provider>
  );
}
