import type { Ingredient } from '../core/types';

/**
 * Rank ingredients against a typed query.
 *
 * Every whitespace-separated word must appear somewhere in the name, in any
 * order, so "breast chicken" finds "Chicken breast, skinless". Matching is
 * case-insensitive and runs against the whole display name, which is what makes
 * "okra" find "Bendi (okra), raw" — the dataset embeds English aliases in the
 * names rather than carrying a separate alias field.
 *
 * Ranking, best first:
 *   0  the name starts with the full query
 *   1  some word in the name starts with the first query word
 *   2  matches, but only mid-word
 * Ties break alphabetically so the order never shifts between renders.
 */
export function rankIngredients(catalogue: readonly Ingredient[], query: string): Ingredient[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...catalogue];

  const words = q.split(/\s+/);

  const scored: { ingredient: Ingredient; score: number }[] = [];
  for (const ingredient of catalogue) {
    const name = ingredient.name.toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;

    let score = 2;
    if (name.startsWith(q)) {
      score = 0;
    } else if (new RegExp(`\\b${words[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(name)) {
      score = 1;
    }
    scored.push({ ingredient, score });
  }

  scored.sort((a, b) => a.score - b.score || a.ingredient.name.localeCompare(b.ingredient.name));
  return scored.map((s) => s.ingredient);
}
