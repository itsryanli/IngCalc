import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import { addEntry, dayLogId, deleteEntry, listAllEntries, loadDay, updateEntry } from './meals';
import type { DayLog, MealEntry } from '../core/types';
import { g } from '../core/units';

const targets: DayLog['targets'] = { kcal: 2310, proteinG: 165, micros: { iron: { rni: 14 } } };
const logFor = (profileId: string, date: string): DayLog => ({
  id: dayLogId(profileId, date), profileId, date, targets,
});

const entry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1, ...over,
} as MealEntry);

beforeEach(async () => {
  await db.open();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('meal storage', () => {
  it('writes the day log alongside the day\'s first entry', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.dayLog?.targets.kcal).toBe(2310);
  });

  it('does not overwrite an existing day log when a second entry lands', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));

    const changed: DayLog = { ...logFor('p1', '2026-09-19'), targets: { ...targets, kcal: 9999 } };
    await addEntry(entry({ id: 'm2', createdAt: 2 }), changed);

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toHaveLength(2);
    // The whole reason dayLogs exists: a later profile edit must not re-read history.
    expect(loaded.dayLog?.targets.kcal).toBe(2310);
  });

  it('returns only the asked-for profile and date', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'm2', date: '2026-09-18' }), logFor('p1', '2026-09-18'));
    await addEntry(entry({ id: 'm3', profileId: 'p2' }), logFor('p2', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries.map((e) => e.id)).toEqual(['m1']);
  });

  it('returns a null day log for a day with no entries', async () => {
    expect(await loadDay('p1', '2026-01-01')).toEqual({ entries: [], dayLog: null });
  });

  it('orders a day\'s entries by when they were added', async () => {
    await addEntry(entry({ id: 'later', createdAt: 20 }), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'earlier', createdAt: 10 }), logFor('p1', '2026-09-19'));

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('lists every entry across every profile and day', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await addEntry(entry({ id: 'm2', profileId: 'p2', date: '2026-08-01' }), logFor('p2', '2026-08-01'));

    expect((await listAllEntries()).map((e) => e.id).sort()).toEqual(['m1', 'm2']);
  });

  it('updates an entry in place', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await updateEntry(entry({ kind: 'weight', cookSessionId: 's1', grams: g(120) }));

    const [only] = (await loadDay('p1', '2026-09-19')).entries;
    expect(only!.kind).toBe('weight');
  });

  it('deletes an entry and leaves the day log behind', async () => {
    await addEntry(entry(), logFor('p1', '2026-09-19'));
    await deleteEntry('m1');

    const loaded = await loadDay('p1', '2026-09-19');
    expect(loaded.entries).toEqual([]);
    // The day was logged; emptying it does not un-log it, and re-adding must not
    // resnapshot against newer targets.
    expect(loaded.dayLog).not.toBeNull();
  });
});
