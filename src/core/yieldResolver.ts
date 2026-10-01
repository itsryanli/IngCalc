import { NOT_COOKED, type Category, type CookMethod, type HeatMethod, type Ingredient, type YieldSample } from './types';

export type YieldSource = 'notCooked' | 'measured' | 'published' | 'categoryDefault';

export interface ResolvedYield {
  factor: number;
  source: YieldSource;
  /** Number of the user's own cooks behind a 'measured' factor; 0 otherwise. */
  sampleCount: number;
}

export type CategoryYield = Record<Category, Record<HeatMethod, number>>;

export function resolveYield(
  ingredient: Ingredient,
  method: CookMethod,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
): ResolvedYield {
  // Not cooked: the weight cannot change, whatever the samples or tables say.
  if (method === NOT_COOKED) return { factor: 1, source: 'notCooked', sampleCount: 0 };

  const usable = samples.filter(
    (s) =>
      s.ingredientId === ingredient.id &&
      s.method === method &&
      !s.excludeFromCalibration &&
      s.rawUsedG > 0,
  );

  if (usable.length > 0) {
    const mean = usable.reduce((sum, s) => sum + s.cookedWeightG / s.rawUsedG, 0) / usable.length;
    return { factor: mean, source: 'measured', sampleCount: usable.length };
  }

  const published = ingredient.publishedYield[method];
  if (published !== undefined) {
    return { factor: published, source: 'published', sampleCount: 0 };
  }

  return { factor: categoryYield[ingredient.category][method], source: 'categoryDefault', sampleCount: 0 };
}
