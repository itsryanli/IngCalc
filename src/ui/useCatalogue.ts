import { useEffect, useState } from 'react';
import type { Ingredient } from '../core/types';
import { INGREDIENTS } from '../data/ingredients';
import { listUserIngredients } from '../storage/userIngredients';

export function mergeCatalogue(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): Ingredient[] {
  const byId = new Map<string, Ingredient>();
  for (const i of bundled) byId.set(i.id, i);
  for (const i of user) byId.set(i.id, i);
  return [...byId.values()]
    .filter((i) => !i.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useCatalogue(): { catalogue: Ingredient[]; loading: boolean; refresh: () => Promise<void> } {
  const [catalogue, setCatalogue] = useState<Ingredient[]>(() => mergeCatalogue(INGREDIENTS, []));
  const [loading, setLoading] = useState(true);

  const loadCatalogue = async () => {
    try {
      const user = await listUserIngredients();
      setCatalogue(mergeCatalogue(INGREDIENTS, user));
    } catch {
      /* storage unavailable: the bundled catalogue still works */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadCatalogue().then(() => {
      if (!cancelled) {
        // Loading state was already set in finally block
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = async () => {
    try {
      const user = await listUserIngredients();
      setCatalogue(mergeCatalogue(INGREDIENTS, user));
    } catch {
      /* storage unavailable: the bundled catalogue still works */
    }
  };

  return { catalogue, loading, refresh };
}
