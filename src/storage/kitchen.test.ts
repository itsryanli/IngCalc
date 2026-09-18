import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import {
  deleteBatchCascade, deleteCookSession, listBatches, listCookSessions,
  loadKitchen, saveBatch, saveCookSession,
} from './kitchen';
import { g, myr } from '../core/units';
import type { Batch, CookSession } from '../core/types';

const batch = (id: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 1_758_240_000_000, ...over,
});

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
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
