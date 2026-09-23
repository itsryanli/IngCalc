import { db } from './db';
import { listAllEntries } from './meals';
import type { Batch, CookSession, MealEntry } from '../core/types';

export const listBatches = (): Promise<Batch[]> => db.batches.toArray();
export const listCookSessions = (): Promise<CookSession[]> => db.cookSessions.toArray();

/**
 * Three tables in one call. Every derived quantity in `core/batch.ts` now needs
 * a batch, its sessions AND the meal entries against them, because the cooked
 * remainder stopped being a stored field.
 */
export const loadKitchen = async (): Promise<{
  batches: Batch[]; sessions: CookSession[]; entries: MealEntry[];
}> => {
  const [batches, sessions, entries] = await Promise.all([
    listBatches(), listCookSessions(), listAllEntries(),
  ]);
  return { batches, sessions, entries };
};

export const saveBatch = async (b: Batch): Promise<void> => { await db.batches.put(b); };
export const saveCookSession = async (s: CookSession): Promise<void> => { await db.cookSessions.put(s); };

/**
 * Deleting a cook must take the meals logged against it. A surviving entry
 * would resolve to no nutrients and sit in its day contributing nothing while
 * still being listed.
 *
 * One transaction, so a failure cannot leave part of it done.
 */
export const deleteCookSession = async (id: string): Promise<void> => {
  await db.transaction('rw', db.cookSessions, db.mealEntries, async () => {
    await db.mealEntries.where('cookSessionId').equals(id).delete();
    await db.cookSessions.delete(id);
  });
};

/**
 * Deleting a batch must take its sessions AND the meals logged against them.
 * A surviving session is an orphan that `toYieldSamples` silently skips; a
 * surviving entry resolves to no nutrients and sits in a day contributing
 * nothing while still being listed.
 *
 * One transaction, so a failure cannot leave part of it done. The day log is
 * not a child of the batch and is left alone.
 */
export const deleteBatchCascade = async (batchId: string): Promise<void> => {
  await db.transaction('rw', db.batches, db.cookSessions, db.mealEntries, async () => {
    const sessionIds = await db.cookSessions.where('batchId').equals(batchId).primaryKeys();
    await db.mealEntries.where('cookSessionId').anyOf(sessionIds).delete();
    await db.cookSessions.where('batchId').equals(batchId).delete();
    await db.batches.delete(batchId);
  });
};
