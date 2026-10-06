import { db } from './db';
import type { Ingredient } from '../core/types';

export const listUserIngredients = (): Promise<Ingredient[]> => db.userIngredients.toArray();

export const saveUserIngredient = async (i: Ingredient): Promise<void> => {
  await db.userIngredients.put({ ...i, source: 'user' });
};

/** Archived, never deleted: Phase 2 batches will reference these rows. */
export const archiveUserIngredient = async (id: string): Promise<void> => {
  await db.userIngredients.update(id, { archived: true });
};

export const restoreUserIngredient = async (id: string): Promise<void> => {
  await db.userIngredients.update(id, { archived: false });
};

/**
 * Saves a new version and archives the old one together, so a dish made again
 * never ends up listed twice, nor missing, if one of the writes fails. Meals
 * logged from the old version keep its figures: archived rows are still read.
 */
export const replaceUserIngredient = async (next: Ingredient, oldId: string): Promise<void> => {
  await db.transaction('rw', db.userIngredients, async () => {
    await db.userIngredients.put({ ...next, source: 'user' });
    await db.userIngredients.update(oldId, { archived: true });
  });
};
