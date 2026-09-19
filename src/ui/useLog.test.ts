import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db } from '../storage/db';
import { addEntry, dayLogId } from '../storage/meals';
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

  it('picks up an entry written after the first load, on refresh', async () => {
    const { result } = renderHook(() => useLog('p1', '2026-09-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await addEntry(entry(), { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19', targets });
    await act(async () => { await result.current.refresh(); });

    expect(result.current.entries).toHaveLength(1);
  });
});
