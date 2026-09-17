import { COOK_METHODS, type CookMethod, type Ingredient, type NutrientKey, type YieldSample } from './types';
import { resolveYield, type CategoryYield, type YieldSource } from './yieldResolver';
import { retentionFor, type RetentionLookup } from './retention';

export interface MethodRow {
  method: CookMethod;
  yieldFactor: number;
  yieldSource: YieldSource;
  /** Percentage of raw WEIGHT remaining after cooking. */
  weightKeptPct: number;
  /** Percentage of each nutrient's MASS surviving. Independent of weight. */
  retainedPct: Partial<Record<NutrientKey, number>>;
  /** Highlighted nutrients for which no sourced retention figure existed (100% assumed). */
  assumedRetentionFor: NutrientKey[];
  /** Mean retained fraction across the highlighted nutrients; sort key. */
  score: number;
}

export function compareMethods(
  ingredient: Ingredient,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
  retention: RetentionLookup,
  highlight: readonly NutrientKey[],
): MethodRow[] {
  const rows = COOK_METHODS.map((method): MethodRow => {
    const y = resolveYield(ingredient, method, samples, categoryYield);

    const retainedPct: Partial<Record<NutrientKey, number>> = {};
    const assumedRetentionFor: NutrientKey[] = [];
    for (const key of highlight) {
      const r = retentionFor(retention, ingredient.category, method, key);
      retainedPct[key] = r.factor * 100;
      if (r.assumed) assumedRetentionFor.push(key);
    }

    const score = highlight.length === 0
      ? 0
      : highlight.reduce((sum, k) => sum + (retainedPct[k] ?? 0), 0) / highlight.length;

    return {
      method, yieldFactor: y.factor, yieldSource: y.source, weightKeptPct: y.factor * 100,
      retainedPct, assumedRetentionFor, score,
    };
  });

  return rows.sort((a, b) => (b.score - a.score) || a.method.localeCompare(b.method));
}
