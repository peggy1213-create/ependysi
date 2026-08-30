import { useEffect, useState } from 'react';
import { api } from './lib/api';

/**
 * Placeholder shell. Real layout, routing, and dashboard widgets come next —
 * this just confirms the frontend builds, can reach the backend, and picks up
 * the Dark Terminal (Warm Edition) palette from index.css.
 */
export default function App() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    api
      .get<{ status: string; time: string }>('/health')
      .then((r) => setHealth(`${r.status} @ ${r.time}`))
      .catch(() => setHealth('backend unreachable'));
  }, []);

  return (
    <main className="min-h-screen bg-bg text-fg flex flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold tracking-widest">
        ▌INVESTMENT <span className="text-accent">DASHBOARD</span>
      </h1>
      <p className="text-sm text-fg-muted">Scaffold ready — API health: {health}</p>
    </main>
  );
}
