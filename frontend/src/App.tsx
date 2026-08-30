import { createContext, useContext, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { AddModal } from './components/AddModal';
import { invalidate } from './lib/useApi';
import { api } from './lib/api';

const TABS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/taiwan', label: 'Taiwan' },
  { to: '/etf', label: 'ETF Center' },
  { to: '/macro', label: 'Macro' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/calendar', label: 'Calendar' },
];

const AddCtx = createContext<() => void>(() => {});
export const useAdd = () => useContext(AddCtx);

export default function App() {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([api.post('/refresh', {}), api.post('/portfolio/refresh', {})]);
      invalidate('/watchlist');
      invalidate('/markets');
      invalidate('/portfolio');
    } finally {
      setRefreshing(false);
    }
  };

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
