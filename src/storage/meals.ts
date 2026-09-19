import { db } from './db';
import type { DayLog, IsoDate, MealEntry } from '../core/types';

/**
 * A natural key rather than a generated id, so the database itself enforces
 * one day log per profile-day. A generated id would let a race write two.
 */
export const dayLogId = (profileId: string, date: IsoDate): string => `${profileId}:${date}`;

/**
 * Every entry, for the derived remainders in `core/batch.ts`. A full scan: at
 * one household's rate this is order 1,500 rows a year, cheaper than the
 * bookkeeping to avoid it, and `loadKitchen` already reads both its tables
 * whole. The `cookSessionId` index is there so it can be narrowed to
 * `anyOf(sessionIds)` if measurement ever justifies it.
 */
export const listAllEntries = (): Promise<MealEntry[]> => db.mealEntries.toArray();

export const loadDay = async (
  profileId: string,
  date: IsoDate,
): Promise<{ entries: MealEntry[]; dayLog: DayLog | null }> => {
  const [entries, dayLog] = await Promise.all([
    db.mealEntries.where('[profileId+date]').equals([profileId, date]).toArray(),
    db.dayLogs.get(dayLogId(profileId, date)),
  ]);
  return { entries: entries.sort((a, b) => a.createdAt - b.createdAt), dayLog: dayLog ?? null };
};

/**
 * The day log is written in the same transaction as the entry, so a failure
 * cannot leave an entry with no targets to measure it against — and it is
 * written only if absent, because a day's targets are frozen at its first
 * entry and must survive every later one.
 */
export const addEntry = async (entry: MealEntry, snapshot: DayLog): Promise<void> => {
  await db.transaction('rw', db.mealEntries, db.dayLogs, async () => {
    if ((await db.dayLogs.get(snapshot.id)) === undefined) await db.dayLogs.add(snapshot);
    await db.mealEntries.add(entry);
  });
};

export const updateEntry = async (entry: MealEntry): Promise<void> => {
  await db.mealEntries.put(entry);
};

/**
 * The day log is deliberately left behind when the last entry goes. Deleting
 * it would let a re-added entry resnapshot against today's targets, which is
 * exactly the history rewrite the table exists to prevent.
 */
export const deleteEntry = async (id: string): Promise<void> => {
  await db.mealEntries.delete(id);
};
