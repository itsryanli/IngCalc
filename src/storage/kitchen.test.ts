import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import {
  deleteBatchCascade, deleteCookSession, listBatches, listCookSessions,
  loadKitchen, saveBatch, saveCookSession,
} from './kitchen';
import { addEntry, dayLogId } from './meals';
import { g, myr } from '../core/units';
import type { Batch, CookSession } from '../core/types';

const batch = (id: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 1_758_240_000_000, ...over,
});

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('kitchen storage', () => {
  it('round-trips a batch, nested purchase included', async () => {
    await saveBatch(batch('b1'));
    expect(await listBatches()).toEqual([batch('b1')]);
  });

  it('updates a batch in place rather than duplicating it', async () => {
    await saveBatch(batch('b1'));
    await saveBatch(batch('b1', { rawWeightG: g(900) }));
    const all = await listBatches();
    expect(all.length).toBe(1);
    expect(all[0]!.rawWeightG).toBe(900);
  });

  it('round-trips a cook session', async () => {
    await saveCookSession(session('s1', 'b1'));
    expect(await listCookSessions()).toEqual([session('s1', 'b1')]);
  });

  it('deletes a single session without touching its batch', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));
    await deleteCookSession('s1');
    expect(await listCookSessions()).toEqual([]);
    expect((await listBatches()).length).toBe(1);
  });

  it('loads both tables together', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));
    const { batches, sessions } = await loadKitchen();
    expect(batches.length).toBe(1);
    expect(sessions.length).toBe(1);
  });

  it('takes a batch sessions with it when the batch is deleted', async () => {
    // An orphaned session would be silently dropped by toYieldSamples, so the
    // cook would vanish from calibration without ever being deleted.
    await saveBatch(batch('b1'));
    await saveBatch(batch('b2'));
    await saveCookSession(session('s1', 'b1'));
    await saveCookSession(session('s2', 'b1'));
    await saveCookSession(session('s3', 'b2'));

    await deleteBatchCascade('b1');

    expect((await listBatches()).map((b) => b.id)).toEqual(['b2']);
    expect((await listCookSessions()).map((s) => s.id)).toEqual(['s3']);
  });

  it('deletes a batch that has no sessions', async () => {
    await saveBatch(batch('b1'));
    await deleteBatchCascade('b1');
    expect(await listBatches()).toEqual([]);
  });
});

describe('deleting a batch', () => {
  it('takes its cooks and the meals logged against them', async () => {
    await db.batches.put(batch('b1'));
    await db.cookSessions.put(session('s1', 'b1'));
    await addEntry(
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19',
        targets: { kcal: 2000, proteinG: 150, micros: {} } },
    );

    await deleteBatchCascade('b1');

    expect(await db.cookSessions.toArray()).toEqual([]);
    // An entry pointing at a deleted session resolves to no nutrients and sits in
    // the day contributing nothing while still being listed.
    expect(await db.mealEntries.toArray()).toEqual([]);
    // The day log is not a child of the batch and stays.
    expect(await db.dayLogs.toArray()).toHaveLength(1);
  });
});

describe('deleting a cook session', () => {
  it('takes the meals logged against it', async () => {
    await db.batches.put(batch('b1'));
    await db.cookSessions.put(session('s1', 'b1'));
    await addEntry(
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19',
        targets: { kcal: 2000, proteinG: 150, micros: {} } },
    );

    await deleteCookSession('s1');

    expect(await db.mealEntries.toArray()).toEqual([]);
    expect((await listBatches()).length).toBe(1);
  });
});

describe('loadKitchen', () => {
  it('returns meal entries alongside batches and sessions', async () => {
    const loaded = await loadKitchen();
    expect(loaded).toHaveProperty('entries');
    expect(Array.isArray(loaded.entries)).toBe(true);
  });

  it('includes entries logged against a session', async () => {
    await db.batches.put(batch('b1'));
    await db.cookSessions.put(session('s1', 'b1'));
    await addEntry(
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19',
        targets: { kcal: 2000, proteinG: 150, micros: {} } },
    );

    const { entries } = await loadKitchen();
    expect(entries.map((e) => e.id)).toEqual(['m1']);
  });
});
