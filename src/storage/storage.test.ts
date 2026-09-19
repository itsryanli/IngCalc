import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, isStorageAvailable } from './db';
import { listProfiles, saveProfile, deleteProfile } from './profiles';
import { getSettings, saveSettings, setActiveProfile } from './settings';
import { listUserIngredients, saveUserIngredient, archiveUserIngredient } from './userIngredients';
import { addEntry, dayLogId } from './meals';
import { cookedRemainingG } from '../core/batch';
import { zeroNutrients } from '../core/nutrients';
import { g, myr } from '../core/units';
import type { Batch, CookSession, Profile, Ingredient } from '../core/types';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

const custom: Ingredient = {
  id: 'u1', name: 'Petai', category: 'vegetable',
  per100gRaw: { ...zeroNutrients(), kcal: 140, protein: 6 },
  publishedYield: {}, absorbsWater: false, source: 'user', archived: false,
};

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
  await db.userIngredients.clear();
  await db.batches.clear();
  await db.cookSessions.clear();
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('storage', () => {
  it('reports availability', async () => {
    expect(await isStorageAvailable()).toBe(true);
  });

  it('reports false when IndexedDB is unavailable, so the app can warn about data loss', async () => {
    const openSpy = vi.spyOn(db, 'open').mockRejectedValueOnce(
      new Error('IndexedDB is unavailable (e.g. Safari private browsing)'),
    );
    try {
      expect(await isStorageAvailable()).toBe(false);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('round-trips a profile', async () => {
    await saveProfile(profile);
    expect(await listProfiles()).toEqual([profile]);
  });

  it('updates a profile in place rather than duplicating it', async () => {
    await saveProfile(profile);
    await saveProfile({ ...profile, weightKg: 72 });
    const all = await listProfiles();
    expect(all.length).toBe(1);
    expect(all[0]!.weightKg).toBe(72);
  });

  it('deletes a profile', async () => {
    await saveProfile(profile);
    await deleteProfile('p1');
    expect(await listProfiles()).toEqual([]);
  });

  it('returns default settings when none are stored', async () => {
    expect(await getSettings()).toEqual({
      id: 'singleton', activeProfileId: null, landingTab: 'log', defaultWeightUnit: 'g',
    });
  });

  it('defaults to the Log tab when nothing is stored', async () => {
    expect((await getSettings()).landingTab).toBe('log');
  });

  it('persists settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: 'p1', landingTab: 'calc', defaultWeightUnit: 'kg' });
    expect((await getSettings()).landingTab).toBe('calc');
  });

  it('sets the active profile without disturbing the other settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'calc', defaultWeightUnit: 'kg' });

    await setActiveProfile('p1');

    const after = await getSettings();
    expect(after.activeProfileId).toBe('p1');
    // A whole-object put built from DEFAULTS would silently reset these two.
    expect(after.landingTab).toBe('calc');
    expect(after.defaultWeightUnit).toBe('kg');
  });

  it('clears the active profile when the last one is deleted', async () => {
    await setActiveProfile('p1');
    await setActiveProfile(null);
    expect((await getSettings()).activeProfileId).toBeNull();
  });

  it('archives a user ingredient instead of deleting it', async () => {
    await saveUserIngredient(custom);
    await archiveUserIngredient('u1');
    const all = await listUserIngredients();
    expect(all.length).toBe(1);
    expect(all[0]!.archived).toBe(true);
  });

  it('resolves false rather than hanging when the database never responds', async () => {
    // The Phase 1 defect: a blocked upgrade leaves Dexie's open promise pending
    // forever, so the launch banner never renders and the user is never told
    // their entries are being discarded.
    const openSpy = vi.spyOn(db, 'open').mockReturnValue(
      new Promise(() => { /* never settles */ }) as ReturnType<typeof db.open>,
    );
    try {
      expect(await isStorageAvailable(20)).toBe(false);
    } finally {
      openSpy.mockRestore();
    }
  });
});

describe('deleting a profile', () => {
  const batch: Batch = {
    id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
    createdAt: 1_758_240_000_000,
  };
  const session: CookSession = {
    id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
    cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
  };

  const eatTwoPortions = async (): Promise<void> => {
    await db.batches.put(batch);
    await db.cookSessions.put(session);
    await saveProfile(profile);
    for (const id of ['m1', 'm2']) {
      await addEntry(
        { id, profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
          kind: 'portion', cookSessionId: 's1', portions: 1 },
        { id: dayLogId('p1', '2026-09-19'), profileId: 'p1', date: '2026-09-19',
          targets: { kcal: 2000, proteinG: 150, micros: {} } },
      );
    }
  };

  it('gives the cook its grams back, because a surviving entry would eat them forever', async () => {
    // An entry outliving its profile is unreachable: loadDay only queries
    // [profileId+date] for a profile that is gone, so no Log day lists it and
    // no delete path can reach it — while loadKitchen still feeds it to
    // cookedRemainingG, which filters on cookSessionId alone.
    await eatTwoPortions();
    expect(cookedRemainingG(session, await db.mealEntries.toArray())).toBe(142);

    await deleteProfile('p1');

    expect(cookedRemainingG(session, await db.mealEntries.toArray())).toBe(284);
  });

  it('takes its entries and day logs, and leaves the kitchen alone', async () => {
    await eatTwoPortions();

    await deleteProfile('p1');

    expect(await db.mealEntries.toArray()).toEqual([]);
    expect(await db.dayLogs.toArray()).toEqual([]);
    // Purchases and cooks belong to the kitchen, not to whoever ate from them.
    expect(await db.batches.count()).toBe(1);
    expect(await db.cookSessions.count()).toBe(1);
  });

  it('leaves another profile\'s entries and day logs untouched', async () => {
    await eatTwoPortions();
    await saveProfile({ ...profile, id: 'p2', name: 'Other' });
    await addEntry(
      { id: 'm3', profileId: 'p2', date: '2026-09-19', label: 'dinner', createdAt: 2,
        kind: 'portion', cookSessionId: 's1', portions: 1 },
      { id: dayLogId('p2', '2026-09-19'), profileId: 'p2', date: '2026-09-19',
        targets: { kcal: 2000, proteinG: 150, micros: {} } },
    );

    await deleteProfile('p1');

    expect((await db.mealEntries.toArray()).map((e) => e.id)).toEqual(['m3']);
    expect((await db.dayLogs.toArray()).map((l) => l.profileId)).toEqual(['p2']);
  });
});
