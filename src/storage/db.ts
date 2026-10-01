import Dexie, { type Table } from 'dexie';
import type {
  Batch, CookSession, DayLog, Ingredient, MealEntry, Profile, ProfileGroup, Settings,
} from '../core/types';

export type { Settings };

/**
 * Exported so `migration.test.ts` can build throwaway databases from the same
 * declarations the app uses, rather than a copy that can drift out of step.
 */
export const SCHEMA_V1: Record<string, string> = {
  profiles: 'id',
  userIngredients: 'id, category, archived',
  settings: 'id',
};

/**
 * Dexie's `stores()` is a delta on the previous version, so only the new tables
 * are declared. Version 1's three tables are untouched, which is why no
 * migration function is needed and no existing row is rewritten.
 *
 * `cookSessions` is indexed by `batchId` for the cascading delete. It is
 * deliberately NOT indexed by ingredient: a session knows only its batch, and
 * calibration joins through `batches` rather than denormalising the ingredient
 * onto every session. See the addendum, §4.
 */
export const SCHEMA_V2: Record<string, string> = {
  batches: 'id, ingredientId, createdAt',
  cookSessions: 'id, batchId, cookedAt',
};

/**
 * `[profileId+date]` serves the day view, which is the only query the Log screen
 * makes on load. `cookSessionId` serves the remainder derivation in `core/batch.ts`.
 *
 * `quick` and `ingredient` entries carry no `cookSessionId`. Dexie omits rows
 * whose indexed key is undefined, so they are absent from session queries by
 * construction rather than by a filter a caller could forget.
 *
 * `dayLogs` needs no secondary index: its primary key `${profileId}:${date}` is
 * the lookup, and being a natural key makes a duplicate row impossible.
 */
export const SCHEMA_V3: Record<string, string> = {
  mealEntries: 'id, [profileId+date], cookSessionId',
  dayLogs: 'id',
};

/** Groups are read whole (a household has a handful), so they need no index. */
export const SCHEMA_V4: Record<string, string> = {
  groups: 'id',
};

export class IngCalcDB extends Dexie {
  profiles!: Table<Profile, string>;
  userIngredients!: Table<Ingredient, string>;
  settings!: Table<Settings, string>;
  batches!: Table<Batch, string>;
  cookSessions!: Table<CookSession, string>;
  mealEntries!: Table<MealEntry, string>;
  dayLogs!: Table<DayLog, string>;
  groups!: Table<ProfileGroup, string>;

  constructor() {
    super('ingcalc');
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2);
    this.version(3).stores(SCHEMA_V3);
    this.version(4).stores(SCHEMA_V4);
  }
}

export const db = new IngCalcDB();

export const STORAGE_PROBE_TIMEOUT_MS = 3000;

/**
 * Private browsing can make IndexedDB unavailable. The app must say so at
 * launch rather than silently discarding everything the user enters.
 *
 * Two failure modes beyond a plain rejection, both introduced by having more
 * than one schema version:
 *
 *  - Another tab holding version 1 open blocks the upgrade to version 2. Dexie
 *    fires `blocked` but never rejects `open()`, so without this the probe
 *    hangs pending and the banner never appears.
 *  - Anything else that leaves the open pending indefinitely is caught by the
 *    timeout, which is the backstop rather than the primary signal.
 *
 * `timeoutMs` is injectable so the hang can be tested in milliseconds.
 */
export async function isStorageAvailable(
  timeoutMs: number = STORAGE_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onBlocked: (() => void) | undefined;

  try {
    const probe = (async () => {
      await db.open();
      await db.settings.limit(1).toArray();
    })();

    const blocked = new Promise<never>((_, reject) => {
      onBlocked = () => reject(new Error('A schema upgrade is blocked by another open tab'));
      db.on('blocked', onBlocked);
    });

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Storage did not respond')), timeoutMs);
    });

    await Promise.race([probe, blocked, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Leaving handlers attached would accumulate one per probe.
    if (onBlocked !== undefined) db.on('blocked').unsubscribe(onBlocked);
  }
}
