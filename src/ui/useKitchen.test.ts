import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useKitchen } from './useKitchen';
import { db } from '../storage/db';
import { saveBatch, saveCookSession } from '../storage/kitchen';
import * as kitchenModule from '../storage/kitchen';
import { g, myr } from '../core/units';
import type { Batch, CookSession } from '../core/types';

const batch = (id: string): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0,
});

const session = (id: string, batchId: string): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
});

describe('useKitchen', () => {
  it('loads batches and sessions on mount', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));

    const { result } = renderHook(() => useKitchen());
    expect(result.current.loading).toBe(true);
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.batches.map((b) => b.id)).toEqual(['b1']);
    expect(result.current.sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('derives yield samples with the ingredient joined on', async () => {
    await saveBatch(batch('b1'));
    await saveCookSession(session('s1', 'b1'));

    const { result } = renderHook(() => useKitchen());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.samples).toEqual([{
      ingredientId: 'chicken-breast', method: 'roasted',
      rawUsedG: 400, cookedWeightG: 284, excludeFromCalibration: false,
    }]);
  });

  it('refresh picks up a batch written after mount', async () => {
    const { result } = renderHook(() => useKitchen());
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.batches).toEqual([]);

    await saveBatch(batch('b1'));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.batches.map((b) => b.id)).toEqual(['b1']);
  });

  it('reports a storage failure instead of showing an empty kitchen', async () => {
    // An empty list and an unreadable database look identical on screen, and
    // "you have no batches" is a lie that invites entering them all again.
    const spy = vi.spyOn(kitchenModule, 'loadKitchen').mockRejectedValue(new Error('nope'));
    try {
      const { result } = renderHook(() => useKitchen());
      await waitFor(() => { expect(result.current.loading).toBe(false); });
      expect(result.current.storageError).not.toBeNull();
      expect(result.current.batches).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
