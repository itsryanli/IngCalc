import Dexie, { type Table } from 'dexie';
import type { Ingredient, Profile } from '../core/types';

export interface Settings {
  id: 'singleton';
  activeProfileId: string | null;
  landingTab: 'today' | 'calc';
  defaultWeightUnit: 'g' | 'kg';
}

export class IngCalcDB extends Dexie {
  profiles!: Table<Profile, string>;
  userIngredients!: Table<Ingredient, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('ingcalc');
    // Version 2 will add `batches` and `cookSessions` in Phase 2.
    this.version(1).stores({
      profiles: 'id',
      userIngredients: 'id, category, archived',
      settings: 'id',
    });
  }
}

export const db = new IngCalcDB();

/**
 * Private browsing can make IndexedDB unavailable. The app must say so at
 * launch rather than silently discarding everything the user enters.
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await db.open();
    await db.settings.limit(1).toArray();
    return true;
  } catch {
    return false;
  }
}
