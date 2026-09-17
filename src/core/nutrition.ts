// src/core/nutrition.ts
import type { CookMethod, Ingredient, NutrientKey, NutrientProfile, YieldSample } from './types';
import { mapNutrients, nutrientsForWeight, scaleNutrients, zeroNutrients } from './nutrients';
import { resolveYield, type CategoryYield, type ResolvedYield } from './yieldResolver';
import { retentionFor, type RetentionLookup } from './retention';
import { g, type Grams } from './units';

export interface CalcStep {
  label: string;
  detail: string;
  value: string;
  /** Where the number came from, shown to the user verbatim. */
  sourceNote?: string;
}

export interface CookInput {
  ingredient: Ingredient;
  rawG: Grams;
  method: CookMethod;
  samples: readonly YieldSample[];
  categoryYield: CategoryYield;
  retention: RetentionLookup;
}

export interface CookedResult {
  rawWeightG: Grams;
  cookedWeightG: Grams;
  yieldUsed: ResolvedYield;
  totals: NutrientProfile;
  per100gCooked: NutrientProfile;
  /** Nutrients for which no sourced retention figure existed. */
  assumedRetentionFor: NutrientKey[];
  steps: CalcStep[];
}

const round = (n: number, dp = 1): string => n.toFixed(dp);

function yieldNote(y: ResolvedYield): string {
  switch (y.source) {
    case 'measured':
      return `your average across ${y.sampleCount} cook${y.sampleCount === 1 ? '' : 's'}`;
    case 'published':
      return 'published factor';
    case 'categoryDefault':
      return 'category default — rough estimate';
  }
}

export function computeRaw(ingredient: Ingredient, rawG: Grams): { totals: NutrientProfile; steps: CalcStep[] } {
  const totals = nutrientsForWeight(ingredient.per100gRaw, rawG);
  return {
    totals,
    steps: [
      {
        label: 'Raw',
        detail: `${round(rawG, 0)}g · ${round(ingredient.per100gRaw.protein)}g protein/100g`,
        value: `${round(totals.protein)}g protein total`,
        sourceNote: ingredient.sourceRef,
      },
    ],
  };
}

export function computeCooked(input: CookInput): CookedResult {
  const { ingredient, rawG, method, samples, categoryYield, retention } = input;

  const rawTotals = nutrientsForWeight(ingredient.per100gRaw, rawG);
  const yieldUsed = resolveYield(ingredient, method, samples, categoryYield);
  const cookedWeightG = g(rawG * yieldUsed.factor);

  const assumedRetentionFor: NutrientKey[] = [];
  const totals = mapNutrients(rawTotals, (value, key) => {
    const r = retentionFor(retention, ingredient.category, method, key);
    if (r.assumed) assumedRetentionFor.push(key);
    return value * r.factor;
  });

  const per100gCooked = cookedWeightG === 0
    ? zeroNutrients()
    : scaleNutrients(totals, 100 / cookedWeightG);

  const proteinRetention = retentionFor(retention, ingredient.category, method, 'protein');

  const steps: CalcStep[] = [
    {
      label: 'Raw',
      detail: `${round(rawG, 0)}g · ${round(ingredient.per100gRaw.protein)}g protein/100g`,
      value: `${round(rawTotals.protein)}g protein total`,
      sourceNote: ingredient.sourceRef,
    },
    {
      label: `Yield (${method})`,
      detail: `× ${yieldUsed.factor.toFixed(2)}`,
      value: `${round(cookedWeightG, 0)}g cooked`,
      sourceNote: yieldNote(yieldUsed),
    },
    {
      label: 'Protein retention',
      detail: `× ${proteinRetention.factor.toFixed(2)}`,
      value: `${round(totals.protein)}g protein`,
      sourceNote: proteinRetention.assumed ? 'assumed 100% — no sourced figure' : 'USDA retention factors',
    },
    {
      label: 'Per 100g cooked',
      detail: `${round(totals.protein)}g ÷ ${round(cookedWeightG, 0)}g × 100`,
      value: `${round(per100gCooked.protein)}g protein/100g`,
    },
  ];

  return { rawWeightG: rawG, cookedWeightG, yieldUsed, totals, per100gCooked, assumedRetentionFor, steps };
}

export function rawFromCooked(
  ingredient: Ingredient,
  cookedG: Grams,
  method: CookMethod,
  samples: readonly YieldSample[],
  categoryYield: CategoryYield,
): { rawWeightG: Grams; yieldUsed: ResolvedYield } {
  const yieldUsed = resolveYield(ingredient, method, samples, categoryYield);
  return { rawWeightG: g(cookedG / yieldUsed.factor), yieldUsed };
}
