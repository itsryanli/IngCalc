import { describe, it, expect, beforeEach } from 'vitest';
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
});
