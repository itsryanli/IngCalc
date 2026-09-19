import Dexie from 'dexie';
import { db } from './db';
import type { Profile } from '../core/types';

export const listProfiles = (): Promise<Profile[]> => db.profiles.toArray();
export const saveProfile = async (p: Profile): Promise<void> => { await db.profiles.put(p); };

/**
 * Deleting a profile must take its meal entries and its day logs.
 *
 * Before Phase 3 nothing referred to a profile and this was a one-liner. Now
 * an entry carries `profileId`, and a surviving one is worse than an orphaned
 * session: `loadKitchen` reads every entry unfiltered and `cookedRemainingG`
 * filters only on `cookSessionId`, so the entry keeps consuming its cook
 * forever, while the only route back to it — `loadDay`'s `[profileId+date]`
 * query — belongs to a profile that no longer exists. Those grams would be
 * unreachable by every delete path and invisible on every Log day.
 *
 * One transaction, so a failure cannot leave part of it done — the same shape
 * as `deleteBatchCascade`.
 */
export const deleteProfile = async (id: string): Promise<void> => {
  await db.transaction('rw', db.profiles, db.mealEntries, db.dayLogs, async () => {
    // There is no `profileId`-alone index, but the compound `[profileId+date]`
    // one covers the whole profile as a key range: every date sorts between
    // the lowest and highest keys IndexedDB can hold.
    await db.mealEntries
      .where('[profileId+date]')
      .between([id, Dexie.minKey], [id, Dexie.maxKey], true, true)
      .delete();
    // `dayLogs` is keyed `${profileId}:${date}` and indexed on nothing else, so
    // this is a filtered scan rather than a `startsWith` prefix on the key. The
    // prefix would re-parse a composite key the row already stores as a plain
    // field, and would over-match a profile id that itself contained the `:`
    // separator. The table holds one row per profile-day, so the scan is small.
    await db.dayLogs.filter((log) => log.profileId === id).delete();
    await db.profiles.delete(id);
  });
};
