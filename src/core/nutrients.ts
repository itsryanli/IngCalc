import { NUTRIENT_KEYS, type NutrientKey, type NutrientProfile } from './types';
import type { Grams } from './units';

export function zeroNutrients(): NutrientProfile {
  const out = {} as NutrientProfile;
  for (const k of NUTRIENT_KEYS) out[k] = 0;
  return out;
}

export function mapNutrients(
  p: NutrientProfile,
  fn: (value: number, key: NutrientKey) => number,
): NutrientProfile {
  const out = {} as NutrientProfile;
  for (const k of NUTRIENT_KEYS) out[k] = fn(p[k], k);
  return out;
}

export const scaleNutrients = (p: NutrientProfile, factor: number): NutrientProfile =>
  mapNutrients(p, (v) => v * factor);

export const nutrientsForWeight = (per100g: NutrientProfile, weight: Grams): NutrientProfile =>
  scaleNutrients(per100g, weight / 100);

export const addNutrients = (a: NutrientProfile, b: NutrientProfile): NutrientProfile =>
  mapNutrients(a, (v, k) => v + b[k]);
