import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

interface CacheEntry {
  data: unknown;
  at: number;
  promise?: Promise<unknown>;
}
const cache = new Map<string, CacheEntry>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

async function load(key: string): Promise<unknown> {
  const existing = cache.get(key);
  if (existing?.promise) return existing.promise;
  const promise = api.get<unknown>(key).then(
    (data) => {
      cache.set(key, { data, at: Date.now() });
      notify(key);
      return data;
    },
    (err) => {
      cache.set(key, { data: existing?.data, at: Date.now() });
      notify(key);
      throw err;
    },
  );
  cache.set(key, { data: existing?.data, at: existing?.at ?? 0, promise });
  return promise;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refetch: () => void;
  updatedAt: number;
}

/**
 * Tiny data hook: shared module cache (no flash on tab switch), optional polling,
 * manual refetch. `path` null = skip.
 */
export function useApi<T>(
  path: string | null,
  opts: { refetchInterval?: number } = {},
): QueryResult<T> {
  const [, force] = useState(0);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const run = useCallback(() => {
    if (!path) return;
    setLoading(true);
    load(path)
      .then(() => mounted.current && setError(undefined))
      .catch((e) => mounted.current && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => mounted.current && setLoading(false));
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    if (!path) return;
    const sub = () => force((n) => n + 1);
    if (!listeners.has(path)) listeners.set(path, new Set());
    listeners.get(path)!.add(sub);

    const entry = cache.get(path);
    if (!entry || Date.now() - entry.at > 10_000) run();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (opts.refetchInterval) timer = setInterval(run, opts.refetchInterval);

    return () => {
      mounted.current = false;
      listeners.get(path)?.delete(sub);
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, opts.refetchInterval]);

  const entry = path ? cache.get(path) : undefined;
  return {
    data: entry?.data as T | undefined,
    error,
    loading,
    refetch: run,
    updatedAt: entry?.at ?? 0,
  };
}

/** Drop cached entries whose key contains `fragment`, forcing a refetch. */
export function invalidate(fragment: string): void {
  for (const key of [...cache.keys()]) {
    if (key.includes(fragment)) {
      cache.delete(key);
      load(key).catch(() => {});
    }
  }
}
