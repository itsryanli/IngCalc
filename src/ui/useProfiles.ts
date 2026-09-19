import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '../core/types';
import { listProfiles } from '../storage/profiles';
import { getSettings, setActiveProfile } from '../storage/settings';

export interface Profiles {
  profiles: Profile[];
  /**
   * The profile every target on every screen is measured against. Resolved
   * rather than stored: see `resolveActive`.
   */
  active: Profile | null;
  loading: boolean;
  /**
   * Set when the profiles could not be read or a switch could not be written.
   * An empty list and an unreadable one look identical on screen, so this has
   * to be surfaced rather than swallowed.
   */
  storageError: string | null;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

/**
 * Falls back rather than returning null when the stored id does not match a
 * profile, which covers two real cases: an install from before the id was ever
 * written (it is null for everyone upgrading), and a profile deleted in
 * another tab. Both should land on a usable profile instead of a blank header.
 */
const resolveActive = (profiles: Profile[], activeId: string | null): Profile | null =>
  profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

export function useProfiles(): Profiles {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const fetchAll = useCallback(async (gen: number) => {
    try {
      const [loaded, settings] = await Promise.all([listProfiles(), getSettings()]);
      if (gen !== generationRef.current) return;
      setProfiles(loaded);
      setActiveId(settings.activeProfileId);
      setStorageError(null);
    } catch (err) {
      console.error('Loading profiles failed', err);
      if (gen !== generationRef.current) return;
      setStorageError('Your profiles could not be read from storage, so none are shown here.');
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

  const setActive = useCallback(async (id: string) => {
    try {
      await setActiveProfile(id);
    } catch (err) {
      console.error('Switching profile failed', err);
      // Leaving activeId untouched keeps the screen honest about which profile
      // is really stored, rather than showing a switch that did not happen.
      setStorageError('Could not switch profile — storage may be blocked or full. Please try again.');
      return;
    }
    setStorageError(null);
    setActiveId(id);
  }, []);

  const active = useMemo(() => resolveActive(profiles, activeId), [profiles, activeId]);

  return { profiles, active, loading, storageError, refresh, setActive };
}
