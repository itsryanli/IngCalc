import { validateEntry, type MealContext } from './meals';
import type { IsoDate, MealEntry, MealEntryFields, MealLabel } from './types';

/** Just the fields that say what was eaten, without whose, when or which meal. */
function fieldsOf(e: MealEntry): MealEntryFields {
  switch (e.kind) {
    case 'quick': return e.proteinG === undefined
      ? { kind: 'quick', name: e.name, kcal: e.kcal }
      : { kind: 'quick', name: e.name, kcal: e.kcal, proteinG: e.proteinG };
    case 'ingredient': return { kind: 'ingredient', ingredientId: e.ingredientId, method: e.method, cookedG: e.cookedG };
    case 'portion': return { kind: 'portion', cookSessionId: e.cookSessionId, portions: e.portions };
    case 'weight': return { kind: 'weight', cookSessionId: e.cookSessionId, grams: e.grams };
  }
}

/**
 * The last time this person had this meal before `date`: the most recent
 * earlier day with something logged under `label`.
 */
export function previousMeal(
  all: readonly MealEntry[],
  profileId: string,
  label: MealLabel,
  date: IsoDate,
): { date: IsoDate; entries: MealEntry[] } | null {
  const earlier = all.filter((e) => e.profileId === profileId && e.label === label && e.date < date);
  if (earlier.length === 0) return null;
  const last = earlier.reduce((d, e) => (e.date > d ? e.date : d), earlier[0]!.date);
  return { date: last, entries: earlier.filter((e) => e.date === last).sort((a, b) => a.createdAt - b.createdAt) };
}

export interface RepeatPlan {
  /** What can be logged again, in the original order. */
  fields: MealEntryFields[];
  /** Entries that cannot, each with the reason, e.g. the cook is all eaten. */
  skipped: { entry: MealEntry; reason: string }[];
}

/**
 * Which of a past meal's entries can be logged again now. Quick and
 * any-ingredient entries always can; a kitchen entry only while its cook still
 * has that much left, counting the copies before it, so repeating a meal can
 * never eat more than the pan holds.
 */
export function planRepeat(
  source: readonly MealEntry[],
  ctx: MealContext,
  allEntries: readonly MealEntry[],
  target: { profileId: string; date: IsoDate; label: MealLabel },
): RepeatPlan {
  const plan: RepeatPlan = { fields: [], skipped: [] };
  const counted: MealEntry[] = [...allEntries];
  for (const entry of source) {
    const fields = fieldsOf(entry);
    const check = validateEntry(fields, ctx, counted, null);
    if (!check.ok) {
      plan.skipped.push({ entry, reason: check.message });
      continue;
    }
    plan.fields.push(fields);
    counted.push({ ...target, id: `repeat-${counted.length}`, createdAt: 0, ...fields });
  }
  return plan;
}
