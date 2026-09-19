import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { SCHEMA_V1, SCHEMA_V2 } from './db';
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

  it('opens straight at version 2 on a fresh install', async () => {
    await Dexie.delete(NAME);

    const fresh = new Dexie(NAME);
    fresh.version(1).stores(SCHEMA_V1);
    fresh.version(2).stores(SCHEMA_V2);
    await fresh.open();

    expect(fresh.verno).toBe(2);
    expect(fresh.tables.map((t) => t.name).sort()).toEqual(
      ['batches', 'cookSessions', 'profiles', 'settings', 'userIngredients'],
    );
    fresh.close();
  });
});
