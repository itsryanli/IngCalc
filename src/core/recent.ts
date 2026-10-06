import type { Batch, CookSession, MealEntry } from './types';

export const RECENT_LIMIT = 5;

/**
 * The ingredients the person used most recently, newest first: whatever they
 * bought (a batch) or ate (a meal entry, through its cook for kitchen entries).
 * Most people eat the same dozen things, so these go at the top of the picker.
 */
export function recentIngredientIds(
  batches: readonly Batch[],
  sessions: readonly CookSession[],
  entries: readonly MealEntry[],
  limit: number = RECENT_LIMIT,
): string[] {
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const events: { at: number; ingredientId: string }[] = batches.map((b) => ({ at: b.createdAt, ingredientId: b.ingredientId }));
  for (const e of entries) {
    if (e.kind === 'quick') continue;
    if (e.kind === 'ingredient') {
      events.push({ at: e.createdAt, ingredientId: e.ingredientId });
      continue;
    }
    const session = sessionById.get(e.cookSessionId);
    const batch = session === undefined ? undefined : batchById.get(session.batchId);
    if (batch !== undefined) events.push({ at: e.createdAt, ingredientId: batch.ingredientId });
  }

  events.sort((a, b) => b.at - a.at);
  const out: string[] = [];
  for (const { ingredientId } of events) {
    if (!out.includes(ingredientId)) out.push(ingredientId);
    if (out.length === limit) break;
  }
  return out;
}
