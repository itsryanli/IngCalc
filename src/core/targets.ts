import { MICRONUTRIENT_KEYS, type CalcStep, type Goal, type NutrientKey, type Profile, type Sex } from './types';

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

/* ==========================================================================
   Explanations

   These live beside the formulas rather than in the UI on purpose: if the copy
   described the activity bands from a component, changing a band would leave
   the explanation quietly wrong. Here the two cannot drift apart.
   ========================================================================== */

const ACTIVITY_BANDS: { max: number; multiplier: number; label: string }[] = [
  { max: 0, multiplier: 1.2, label: 'no sessions — sedentary' },
  { max: 2, multiplier: 1.375, label: '1–2 sessions — lightly active' },
  { max: 4, multiplier: 1.55, label: '3–4 sessions — moderately active' },
  { max: 6, multiplier: 1.725, label: '5–6 sessions — very active' },
  { max: Infinity, multiplier: 1.9, label: '7+ sessions — extra active' },
];

const GOAL_LABEL: Record<Goal, string> = {
  cut: 'cut — 15% below maintenance',
  maintain: 'maintain — no adjustment',
  bulk: 'bulk — 10% above maintenance',
};

const n = (value: number, dp = 0): string =>
  value.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export interface TargetExplanations {
  bmr: CalcStep[];
  tdee: CalcStep[];
  calories: CalcStep[];
  protein: CalcStep[];
}

/**
 * Plain-language explanation of each profile target, with the user's own values
 * substituted into the arithmetic. Rendered by the same component that shows how
 * a cooked weight was reached, so both screens explain themselves the same way.
 */
export function explainTargets(profile: Profile, today: Date): TargetExplanations {
  const age = ageFrom(profile, today);
  const base = bmr(profile, today);
  const band = ACTIVITY_BANDS.find((b) => profile.sessionsPerWeek <= b.max) ?? ACTIVITY_BANDS[ACTIVITY_BANDS.length - 1]!;
  const total = tdee(profile, today);
  const calories = calorieTarget(profile, today);
  const gPerKg = proteinGPerKgFor(profile);
  const protein = proteinTargetG(profile);
  const overridden = profile.proteinGPerKg !== undefined;

  return {
    bmr: [
      {
        label: 'What it is',
        detail: 'Energy your body uses at complete rest — breathing, circulation, staying warm — before any movement at all.',
        value: '',
      },
      {
        label: 'Mifflin-St Jeor',
        detail: `10 × ${n(profile.weightKg)}kg + 6.25 × ${n(profile.heightCm)}cm − 5 × ${n(age)} ${profile.sex === 'male' ? '+ 5' : '− 161'}`,
        value: `${n(base)} kcal`,
        sourceNote: `${profile.sex} variant of the Mifflin-St Jeor equation. An estimate — individuals vary by roughly ±10% around it.`,
      },
    ],
    tdee: [
      {
        label: 'What it is',
        detail: 'Everything you burn in a day: resting energy plus the movement your training and daily life add on top.',
        value: '',
      },
      {
        label: 'Activity multiplier',
        detail: `${n(base)} × ${band.multiplier}`,
        value: `${n(total)} kcal`,
        sourceNote: `${n(profile.sessionsPerWeek)} per week falls in "${band.label}". A coarse five-band estimate, not a measurement of what you actually do.`,
      },
    ],
    calories: [
      {
        label: 'What it is',
        detail: 'What to eat in a day to move toward your goal, rather than just hold steady.',
        value: '',
      },
      {
        label: 'Goal adjustment',
        detail: `${n(total)} × ${GOAL_CALORIE_FACTOR[profile.goal]}`,
        value: `${n(calories)} kcal`,
        sourceNote: `Goal set to ${GOAL_LABEL[profile.goal]}.`,
      },
    ],
    protein: [
      {
        label: 'What it is',
        detail: 'Daily protein, scaled to your bodyweight rather than to a population average.',
        value: '',
      },
      {
        label: 'Rate × bodyweight',
        detail: `${gPerKg} g/kg × ${n(profile.weightKg)}kg`,
        value: `${n(protein)} g`,
        sourceNote: overridden
          ? `${gPerKg} g/kg is your own override, not the goal default.`
          : `${gPerKg} g/kg is the default for "${profile.goal}". Override it on this screen if you train to a different target.`,
      },
    ],
  };
}
