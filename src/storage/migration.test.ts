import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from './db';
import { zeroNutrients } from '../core/nutrients';
import type { Ingredient, Profile } from '../core/types';

const NAME = 'ingcalc-migration-test';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

const custom: Ingredient = {
  id: 'u1', name: 'Petai', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 140, protein: 6 },
  publishedYield: {}, absorbsWater: false, source: 'user', archived: false,
};

afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('schema upgrade v1 to v2', () => {
  it('keeps Phase 1 data and adds the two new tables', async () => {
    await Dexie.delete(NAME);

    const v1 = new Dexie(NAME);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('profiles').put(profile);
    await v1.table('userIngredients').put(custom);
    v1.close();

    const v2 = new Dexie(NAME);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();

    expect(v2.verno).toBe(2);
    // Data is never dropped: the parent spec promises a versioned migration.
    expect(await v2.table('profiles').toArray()).toEqual([profile]);
    expect(await v2.table('userIngredients').toArray()).toEqual([custom]);
    expect(await v2.table('batches').toArray()).toEqual([]);
    expect(await v2.table('cookSessions').toArray()).toEqual([]);
    v2.close();
  });

  it('opens straight at version 3 on a fresh install', async () => {
    await Dexie.delete(NAME);

    const fresh = new Dexie(NAME);
    fresh.version(1).stores(SCHEMA_V1);
    fresh.version(2).stores(SCHEMA_V2);
    fresh.version(3).stores(SCHEMA_V3);
    await fresh.open();

    expect(fresh.verno).toBe(3);
    expect(fresh.tables.map((t) => t.name).sort()).toEqual(
      ['batches', 'cookSessions', 'dayLogs', 'mealEntries', 'profiles', 'settings', 'userIngredients'],
    );
    fresh.close();
  });
});

describe('schema upgrade v2 to v3', () => {
  it('keeps Phase 1 and Phase 2 data and adds the two meal tables', async () => {
    await Dexie.delete(NAME);

    const v2 = new Dexie(NAME);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();
    await v2.table('profiles').put(profile);
    await v2.table('batches').put({
      id: 'b1', ingredientId: 'u1', rawWeightG: 1000,
      purchase: { pricePaidMYR: 20, location: 'Jaya Grocer', date: '2026-09-18' },
      createdAt: 1,
    });
    v2.close();

    const v3 = new Dexie(NAME);
    v3.version(1).stores(SCHEMA_V1);
    v3.version(2).stores(SCHEMA_V2);
    v3.version(3).stores(SCHEMA_V3);
    await v3.open();

    expect(v3.verno).toBe(3);
    expect(await v3.table('profiles').toArray()).toEqual([profile]);
    expect((await v3.table('batches').toArray())).toHaveLength(1);
    expect(await v3.table('mealEntries').toArray()).toEqual([]);
    expect(await v3.table('dayLogs').toArray()).toEqual([]);
    v3.close();
  });

  it('indexes meal entries by profile-and-date and by cook session', async () => {
    await Dexie.delete(NAME);

    const dbv3 = new Dexie(NAME);
    dbv3.version(1).stores(SCHEMA_V1);
    dbv3.version(2).stores(SCHEMA_V2);
    dbv3.version(3).stores(SCHEMA_V3);
    await dbv3.open();

    await dbv3.table('mealEntries').bulkPut([
      { id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: 'm2', profileId: 'p1', date: '2026-09-18', label: 'dinner', createdAt: 2,
        kind: 'weight', cookSessionId: 's1', grams: 50 },
      { id: 'm3', profileId: 'p1', date: '2026-09-19', label: 'snack', createdAt: 3,
        kind: 'quick', name: 'Teh tarik', kcal: 180 },
    ]);

    const day = await dbv3.table('mealEntries')
      .where('[profileId+date]').equals(['p1', '2026-09-19']).toArray();
    expect(day.map((e) => e.id).sort()).toEqual(['m1', 'm3']);

    // A quick entry has no cookSessionId, and Dexie omits rows whose indexed key is
    // undefined — so session queries exclude them by construction, not by a filter.
    const forSession = await dbv3.table('mealEntries')
      .where('cookSessionId').equals('s1').toArray();
    expect(forSession.map((e) => e.id).sort()).toEqual(['m1', 'm2']);

    dbv3.close();
  });
});
