import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileGroup } from '../core/types';
import { listGroups } from '../storage/groups';

export function useGroups(): { groups: ProfileGroup[]; refresh: () => Promise<void> } {
  const [groups, setGroups] = useState<ProfileGroup[]>([]);
  const generationRef = useRef(0);

  const fetchAll = useCallback(async (gen: number) => {
    try {
      const loaded = await listGroups();
      if (gen === generationRef.current) setGroups(loaded);
    } catch (err) {
      // Groups are an extra: without them every screen still works for one person.
      console.error('Loading groups failed', err);
    }
  }, []);

  useEffect(() => {
    const gen = ++generationRef.current;
    void fetchAll(gen);
    return () => { generationRef.current += 1; };
  }, [fetchAll]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchAll(gen);
  }, [fetchAll]);

  return { groups, refresh };
}
