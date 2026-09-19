import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../storage/db';
import { addEntry, dayLogId } from '../storage/meals';
import * as mealsModule from '../storage/meals';
import { useLog } from './useLog';
import type { DayLog, MealEntry } from '../core/types';

const targets: DayLog['targets'] = { kcal: 2310, proteinG: 165, micros: {} };
const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'quick', name: 'Teh tarik', kcal: 180, ...over,
} as MealEntry);

beforeEach(async () => {
  await db.open();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('useLog', () => {
  it('loads a day\'s entries and its frozen targets', async () => {
    await addEntry(entry(), { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });

    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.dayLog?.targets.kcal).toBe(2310);
  });

  it('reloads when the date changes', async () => {
    await addEntry(entry({ id: 'yesterday', date: '2026-09-18' }),
      { id: dayLogId('p1', '2026-09-18'), profileId: 'p1', date: '2026-09-18', targets });

    const { result, rerender } = renderHook(({ d }) => useLog('p1', d), {
      initialProps: { d: '2026-09-19' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(0);

    rerender({ d: '2026-09-18' });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('reloads when the profile changes', async () => {
    await addEntry(entry({ id: 'theirs', profileId: 'p2' }),
      { id: dayLogId('p2', '2026-09-19'), profileId: 'p2', date: '2026-09-19', targets });

    const { result, rerender } = renderHook(({ p }) => useLog(p, '2026-09-19'), {
      initialProps: { p: 'p1' as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(0);

    rerender({ p: 'p2' });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('reads nothing and reports nothing wrong when there is no profile', async () => {
    const { result } = renderHook(() => useLog(null, '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(result.current.dayLog).toBeNull();
    // No profile is a setup state, not a storage failure.
    expect(result.current.storageError).toBeNull();
  });

  it('surfaces a read failure rather than looking like an empty day', async () => {
    db.close();
    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.storageError).not.toBeNull());
    await db.open();
  });

  it('discards a stale load that resolves after a newer one has already landed', async () => {
    // Regression test for the generation counter: without it, a slow load for
    // the day being navigated away from can resolve after the fast load for
    // the new day and clobber it with stale entries.
    await addEntry(entry({ id: 'stale', date: '2026-09-19' }),
      { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });
    await addEntry(entry({ id: 'fresh', date: '2026-09-18' }),
      { id: dayLogId('p1', '2026-09-18'), profileId: 'p1', date: '2026-09-18', targets });

    const originalLoadDay = mealsModule.loadDay;
    let releaseStaleLoad: () => void = () => {};
    const staleLoadHeldOpen = new Promise<void>((resolve) => { releaseStaleLoad = resolve; });

    // The first render's load (for 2026-09-19) is held open until released
    // below. The second render's load (for 2026-09-18, after the rerender)
    // is not intercepted by mockImplementationOnce, so it runs — and
    // resolves — normally, landing well before the stale one is released.
    const spy = vi.spyOn(mealsModule, 'loadDay').mockImplementationOnce(async (profileId, date) => {
      await staleLoadHeldOpen;
      return originalLoadDay(profileId, date);
    });

    try {
      const { result, rerender } = renderHook(({ d }) => useLog('p1', d), {
        initialProps: { d: '2026-09-19' },
      });

      rerender({ d: '2026-09-18' });
      // The render-phase loading reset (not the effect) is what flips this
      // back to true on a prop change — asserted here since it would
      // otherwise go untested.
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.entries.map((e) => e.id)).toEqual(['fresh']);

      // Let the stale 2026-09-19 load finally resolve, well after the fresh
      // one already landed.
      await act(async () => {
        releaseStaleLoad();
        await staleLoadHeldOpen;
        await Promise.resolve();
      });

      // The stale result must not have clobbered the fresh one.
      expect(result.current.entries.map((e) => e.id)).toEqual(['fresh']);
    } finally {
      spy.mockRestore();
    }
  });

  it('picks up an entry written after the first load, on refresh', async () => {
    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await addEntry(entry(), { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.entries).toHaveLength(1);
  });
});
