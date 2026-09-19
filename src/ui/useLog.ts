import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayLog, IsoDate, MealEntry } from '../core/types';
import { loadDay } from '../storage/meals';

export interface Log {
  entries: MealEntry[];
  /** The targets frozen when this day was first logged; null until it is. */
  dayLog: DayLog | null;
  loading: boolean;
  /**
   * Set when the day could not be read. An empty day and an unreadable one
   * look identical on screen, so this has to be surfaced rather than swallowed.
   */
  storageError: string | null;
  refresh: () => Promise<void>;
}

export function useLog(profileId: string | null, date: IsoDate): Log {
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const generationRef = useRef(0);

  // Tracks the profile/date pair the current render's state belongs to. When
  // it changes, loading is reset to true right here during render — React's
  // documented pattern for adjusting state when a prop changes — rather than
  // from inside the effect below, so the reset itself is not a setState
  // called synchronously inside an effect (the lint rule that flags exactly
  // that, since it usually signals state that should live outside an effect).
  const key = `${profileId}\u0000${date}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setLoading(true);
  }

  const fetchDay = useCallback(async (gen: number) => {
    // No profile is a setup state, not a failure: there is nothing to read and
    // nothing has gone wrong. Reporting an error here would put a storage
    // warning in front of a first-run user.
    if (profileId === null) {
      if (gen !== generationRef.current) return;
      setEntries([]); setDayLog(null); setStorageError(null); setLoading(false);
      return;
    }

    try {
      const loaded = await loadDay(profileId, date);
      if (gen !== generationRef.current) return;
      setEntries(loaded.entries);
      setDayLog(loaded.dayLog);
      setStorageError(null);
    } catch (err) {
      console.error('Loading the day failed', err);
      if (gen !== generationRef.current) return;
      setStorageError('This day could not be read from storage, so nothing is shown here.');
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, [profileId, date]);

  // Re-runs on profileId or date, via fetchDay's identity. The generation is
  // bumped on entry as well as teardown: unlike useKitchen and useProfiles,
  // this hook re-runs on a prop change, so a load in flight for the previous
  // day must not be allowed to land after the new one has started.
  useEffect(() => {
    const gen = ++generationRef.current;
    void fetchDay(gen);
    return () => { generationRef.current += 1; };
  }, [fetchDay]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchDay(gen);
  }, [fetchDay]);

  return { entries, dayLog, loading, storageError, refresh };
}
