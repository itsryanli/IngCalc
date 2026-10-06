import { addNutrients, scaleNutrients, zeroNutrients } from './nutrients';
import { NUTRIENT_KEYS, type Ingredient, type NutrientKey, type NutrientProfile, type Recipe } from './types';

export interface DishFigures {
  per100g: NutrientProfile;
  /** Nutrients some ingredient has no figure for: the dish cannot know them either. */
  unknownNutrients: NutrientKey[];
  /** Total weight of the listed ingredients, before water was driven off. */
  inputWeightG: number;
}

export type DishCheck = { ok: true; figures: DishFigures } | { ok: false; message: string };

/**
 * A dish's nutrients per 100 g as eaten: everything that went in, divided by
 * what the finished dish weighs. Baking or cooking moves water, not protein,
 * fat, carbohydrate or minerals, so those are carried over whole and only the
 * concentration changes, the same rule the Kitchen uses for a weighed cook.
 */
export function dishFigures(
  recipe: Recipe,
  ingredientById: (id: string) => Ingredient | undefined,
): DishCheck {
  if (recipe.items.length === 0) return { ok: false, message: 'Add at least one ingredient.' };
  if (!(recipe.finishedWeightG > 0)) return { ok: false, message: 'Weigh the finished dish and enter its weight.' };

  let totals = zeroNutrients();
  let inputWeightG = 0;
  const unknown = new Set<NutrientKey>();
  for (const item of recipe.items) {
    const ingredient = ingredientById(item.ingredientId);
    if (ingredient === undefined) return { ok: false, message: 'Choose an ingredient for every row.' };
    if (!(item.grams > 0)) return { ok: false, message: `Enter how much ${ingredient.name.toLowerCase()} went in.` };
    totals = addNutrients(totals, scaleNutrients(ingredient.per100gRaw, item.grams / 100));
    inputWeightG += item.grams;
    for (const k of ingredient.unknownNutrients ?? []) unknown.add(k);
  }

  return {
    ok: true,
    figures: {
      per100g: scaleNutrients(totals, 100 / recipe.finishedWeightG),
      unknownNutrients: NUTRIENT_KEYS.filter((k) => unknown.has(k)),
      inputWeightG,
    },
  };
}
