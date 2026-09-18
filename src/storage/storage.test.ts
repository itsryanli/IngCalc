import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, isStorageAvailable } from './db';
import { listProfiles, saveProfile, deleteProfile } from './profiles';
import { getSettings, saveSettings } from './settings';
import { listUserIngredients, saveUserIngredient, archiveUserIngredient } from './userIngredients';
import { zeroNutrients } from '../core/nutrients';
import type { Profile, Ingredient } from '../core/types';

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
      id: 'singleton', activeProfileId: null, landingTab: 'today', defaultWeightUnit: 'g',
    });
  });

  it('persists settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: 'p1', landingTab: 'calc', defaultWeightUnit: 'kg' });
    expect((await getSettings()).landingTab).toBe('calc');
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
