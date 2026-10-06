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
