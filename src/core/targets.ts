import { MICRONUTRIENT_KEYS, type Goal, type NutrientKey, type Profile, type Sex } from './types';

const KG_PER_LB = 2.20462;

const GOAL_CALORIE_FACTOR: Record<Goal, number> = { cut: 0.85, maintain: 1.0, bulk: 1.10 };
const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 1.8, bulk: 2.0 };

export const ageFrom = (profile: Profile, today: Date): number =>
  today.getUTCFullYear() - profile.birthYear;

/** Mifflin-St Jeor. The formula has two variants, selected by `profile.sex`. */
export function bmr(profile: Profile, today: Date): number {
  const age = ageFrom(profile, today);
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

export function activityMultiplier(sessionsPerWeek: number): number {
  if (sessionsPerWeek <= 0) return 1.2;
  if (sessionsPerWeek <= 2) return 1.375;
  if (sessionsPerWeek <= 4) return 1.55;
  if (sessionsPerWeek <= 6) return 1.725;
  return 1.9;
}

export const tdee = (profile: Profile, today: Date): number =>
  bmr(profile, today) * activityMultiplier(profile.sessionsPerWeek);

export const calorieTarget = (profile: Profile, today: Date): number =>
  tdee(profile, today) * GOAL_CALORIE_FACTOR[profile.goal];

export const proteinGPerKgFor = (profile: Profile): number =>
  profile.proteinGPerKg ?? GOAL_PROTEIN_G_PER_KG[profile.goal];

export const proteinTargetG = (profile: Profile): number =>
  proteinGPerKgFor(profile) * profile.weightKg;

export const proteinGPerLb = (profile: Profile): number =>
  proteinGPerKgFor(profile) / KG_PER_LB;

export interface MicroTarget {
  rni?: number;
  dv?: number;
}

export type RniLookup = (sex: Sex, age: number) => Partial<Record<NutrientKey, number>>;

export function microTargets(
  profile: Profile,
  today: Date,
  rniLookup: RniLookup,
  dvTable: Partial<Record<NutrientKey, number>>,
): Partial<Record<NutrientKey, MicroTarget>> {
  const rni = rniLookup(profile.sex, ageFrom(profile, today));
  const out: Partial<Record<NutrientKey, MicroTarget>> = {};
  // Only micronutrients; calories and protein are personal targets derived from the profile, not population tables.
  for (const k of MICRONUTRIENT_KEYS) {
    const entry: MicroTarget = {};
    if (rni[k] !== undefined) entry.rni = rni[k];
    if (dvTable[k] !== undefined) entry.dv = dvTable[k];
    if (entry.rni !== undefined || entry.dv !== undefined) out[k] = entry;
  }
  return out;
}
