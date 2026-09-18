import { db } from './db';
import type { Batch, CookSession } from '../core/types';

export const listBatches = (): Promise<Batch[]> => db.batches.toArray();
export const listCookSessions = (): Promise<CookSession[]> => db.cookSessions.toArray();

/**
 * Both tables in one call, because every derived quantity in `core/batch.ts`
 * needs a batch and its sessions together, and calibration needs all of both.
 */
export const loadKitchen = async (): Promise<{ batches: Batch[]; sessions: CookSession[] }> => {
  const [batches, sessions] = await Promise.all([listBatches(), listCookSessions()]);
  return { batches, sessions };
};

export const saveBatch = async (b: Batch): Promise<void> => { await db.batches.put(b); };
export const saveCookSession = async (s: CookSession): Promise<void> => { await db.cookSessions.put(s); };
export const deleteCookSession = async (id: string): Promise<void> => { await db.cookSessions.delete(id); };

/**
 * Deleting a batch must take its sessions with it. A surviving session would
 * be an orphan, which `toYieldSamples` silently skips — so the cook would
 * disappear from calibration while still occupying a row.
 *
 * One transaction, so a failure cannot leave half of it done.
 */
export const deleteBatchCascade = async (batchId: string): Promise<void> => {
  await db.transaction('rw', db.batches, db.cookSessions, async () => {
    await db.cookSessions.where('batchId').equals(batchId).delete();
    await db.batches.delete(batchId);
  });
};
