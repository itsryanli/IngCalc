import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toYieldSamples } from '../core/calibration';
import type { Batch, CookSession, YieldSample } from '../core/types';
import { loadKitchen } from '../storage/kitchen';

export interface Kitchen {
  batches: Batch[];
  sessions: CookSession[];
  /** Fed to `resolveYield`, which is what turns published factors into measured ones. */
  samples: YieldSample[];
  loading: boolean;
  /**
   * Set when the tables could not be read. Unlike the calculator, an empty
   * kitchen and an unreadable one look identical on screen, so this must be
   * surfaced rather than swallowed.
   */
  storageError: string | null;
  refresh: () => Promise<void>;
}

export function useKitchen(): Kitchen {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sessions, setSessions] = useState<CookSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const fetchAll = useCallback(async (gen: number) => {
    try {
      const loaded = await loadKitchen();
      if (gen !== generationRef.current) return;
      setBatches(loaded.batches);
      setSessions(loaded.sessions);
      setStorageError(null);
    } catch (err) {
      console.error('Loading the kitchen failed', err);
      if (gen !== generationRef.current) return;
      setStorageError('Your kitchen could not be read from storage, so nothing is shown here.');
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const gen = generationRef.current;
    void fetchAll(gen);
    return () => { generationRef.current += 1; };
  }, [fetchAll]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchAll(gen);
  }, [fetchAll]);

  const samples = useMemo(() => toYieldSamples(batches, sessions), [batches, sessions]);

  return { batches, sessions, samples, loading, storageError, refresh };
}
