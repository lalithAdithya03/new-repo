import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

function message(err: unknown) {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Unexpected error';
}

/**
 * Runs an async loader when deps change; ignores stale responses.
 * `reload()` refreshes in the background: current data stays on screen (loading stays false),
 * so forms and messages below a reloading list are not unmounted.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const background = useRef(false);

  useEffect(() => {
    const id = ++seq.current;
    if (!background.current) setLoading(true);
    background.current = false;
    setError(null);
    fn().then(
      (d) => { if (id === seq.current) { setDataState(d); setLoading(false); } },
      (e) => { if (id === seq.current) { setError(message(e)); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => { background.current = true; setTick((t) => t + 1); }, []);
  const setData = useCallback((u: (prev: T | undefined) => T | undefined) => setDataState(u), []);
  return { data, error, loading, reload, setData };
}

/** Throws Supabase errors so useAsync can surface them. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
