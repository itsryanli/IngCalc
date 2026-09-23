import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_SCHEMA_VERSION, parseBackup, type BackupTables } from '../core/backup';
import { g } from '../core/units';
import { applyRestore, exportAll, previewRestore, readAllTables } from './backup';
import { db } from './db';

const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
const fixture = (): BackupTables => {
  const r = parseBackup(FIXTURE);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

/** toArray() returns key order; compare tables regardless of it. */
const byId = <T extends { id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const normalise = (t: BackupTables) =>
  Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, byId(rows as { id: string }[])]));

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup storage', () => {
  it('stamps the schema version the database actually runs', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(db.verno);
  });

  it('round-trips: restore, export, and the tables are what went in', async () => {
    const r = await applyRestore('replace', fixture());
    expect(r.ok).toBe(true);
    const file = await exportAll(new Date('2026-09-23T00:00:00.000Z'));
    expect(file.app).toBe('ingcalc');
    expect(normalise(file.tables)).toEqual(normalise(fixture()));
  });

  it('replace erases what was on the device', async () => {
    await db.batches.put({ ...fixture().batches[0]!, id: 'b-local' });
    await applyRestore('replace', fixture());
    expect((await db.batches.toArray()).map((b) => b.id).sort()).toEqual(['b-chicken', 'b-tempeh']);
  });

  it('merge adds only missing rows and leaves a device row with the same id untouched', async () => {
    const local = fixture().batches[0]!;
    await db.batches.put({ ...local, purchase: { ...local.purchase, location: 'Changed here' } });
    await db.settings.put({ id: 'singleton', activeProfileId: null, landingTab: 'kitchen', defaultWeightUnit: 'kg' });
    const r = await applyRestore('merge', fixture());
    expect(r.ok).toBe(true);
    expect((await db.batches.get('b-chicken'))!.purchase.location).toBe('Changed here');
    expect(await db.batches.get('b-tempeh')).toBeDefined();
    expect((await db.settings.get('singleton'))!.landingTab).toBe('kitchen');
  });

  it.each(['replace', 'merge'] as const)('%s leaves every table as it was when a write fails', async (mode) => {
    await applyRestore('replace', fixture());
    await db.batches.put({ ...fixture().batches[0]!, id: 'b-local' });
    const before = await readAllTables();

    vi.spyOn(db.dayLogs, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    const incoming = fixture();
    incoming.dayLogs = [{ ...incoming.dayLogs[0]!, id: 'p-ali:2026-09-22', date: '2026-09-22' }];
    await expect(applyRestore(mode, incoming)).rejects.toThrow('disk full');

    expect(normalise(await readAllTables())).toEqual(normalise(before));
  });

  it('re-checks inside the write, so a change made after the preview is not merged over', async () => {
    const preview = await previewRestore('merge', fixture());
    expect(preview.ok).toBe(true);

    // Between preview and confirm, another tab logs 200g against the same cook.
    await db.cookSessions.put(fixture().cookSessions[0]!);
    await db.batches.put(fixture().batches[0]!);
    await db.profiles.put(fixture().profiles[0]!);
    await db.mealEntries.put({
      id: 'e-other-tab', profileId: 'p-ali', date: '2026-09-21', label: 'dinner', createdAt: 9,
      kind: 'weight', cookSessionId: 's-roast', grams: g(200),
    });

    const r = await applyRestore('merge', fixture());
    expect(r.ok).toBe(false);
    expect(await db.mealEntries.count()).toBe(1);
  });
});
