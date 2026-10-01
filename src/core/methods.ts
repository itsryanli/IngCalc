import { NOT_COOKED, type Category, type CookMethod, type Ingredient } from './types';

/** Categories almost always eaten as they come: a banana, a tub of yogurt. */
const EATEN_AS_IS: readonly Category[] = ['fruit', 'dairy'];

/**
 * The method a form should start on for this ingredient: the one it was saved
 * with, else "not cooked" for fruit and dairy, else whatever the form had.
 * Only a starting point; the person can always pick another.
 */
export const startingMethod = (ingredient: Ingredient, fallback: CookMethod): CookMethod =>
  ingredient.defaultMethod ?? (EATEN_AS_IS.includes(ingredient.category) ? NOT_COOKED : fallback);
