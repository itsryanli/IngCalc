import {
  makeBackup, planRestore,
  type BackupFile, type BackupTables, type RestoreMode, type RestorePlan, type Result,
} from '../core/backup';
import { INGREDIENTS } from '../data/ingredients';
import { db } from './db';

const allTables = () => [
  db.profiles, db.userIngredients, db.settings, db.batches, db.cookSessions, db.mealEntries, db.dayLogs,
];

async function readTables(): Promise<BackupTables> {
  const [profiles, userIngredients, settings, batches, cookSessions, mealEntries, dayLogs] =
    await Promise.all([
      db.profiles.toArray(), db.userIngredients.toArray(), db.settings.toArray(),
      db.batches.toArray(), db.cookSessions.toArray(), db.mealEntries.toArray(),
      db.dayLogs.toArray(),
    ]);
  return { profiles, userIngredients, settings, batches, cookSessions, mealEntries, dayLogs };
}

/** One read transaction, so the seven tables are a single consistent snapshot. */
export const readAllTables = (): Promise<BackupTables> =>
  db.transaction('r', allTables(), readTables);

export const exportAll = async (now: Date = new Date()): Promise<BackupFile> =>
  makeBackup(await readAllTables(), now);

/** What the confirm step shows. Advisory: `applyRestore` plans again. */
export const previewRestore = async (
  mode: RestoreMode,
  backup: BackupTables,
): Promise<Result<RestorePlan>> => planRestore(mode, backup, await readAllTables(), INGREDIENTS);

/**
 * The only write. It plans again from inside the transaction, against what is
 * on the device NOW, because another tab may have written since the preview,
 * and a stale plan must not be applied.
 *
 * A failed plan returns without writing. A failed write throws out of the
 * callback, and Dexie aborts the transaction, so every table stays as it was,
 * including the ones `replace` had already cleared.
 */
export const applyRestore = (
  mode: RestoreMode,
  backup: BackupTables,
): Promise<Result<RestorePlan>> =>
  db.transaction('rw', allTables(), async () => {
    const plan = planRestore(mode, backup, await readTables(), INGREDIENTS);
    if (!plan.ok) return plan;

    if (mode === 'replace') await Promise.all(allTables().map((t) => t.clear()));

    const w = plan.value.toWrite;
    await db.profiles.bulkAdd(w.profiles);
    await db.userIngredients.bulkAdd(w.userIngredients);
    await db.settings.bulkAdd(w.settings);
    await db.batches.bulkAdd(w.batches);
    await db.cookSessions.bulkAdd(w.cookSessions);
    await db.mealEntries.bulkAdd(w.mealEntries);
    await db.dayLogs.bulkAdd(w.dayLogs);
    return plan;
  });
