import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { Ingredient } from '../core/types';
import { INGREDIENTS } from '../data/ingredients';
import { listUserIngredients } from '../storage/userIngredients';

/** Every ingredient, archived ones included: what lookups for past meals and batches need. */
export function mergeAll(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): Ingredient[] {
  const byId = new Map<string, Ingredient>();
  for (const i of bundled) byId.set(i.id, i);
  for (const i of user) byId.set(i.id, i);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** What the pickers offer: archived ingredients are hidden from new choices. */
export function mergeCatalogue(
  bundled: readonly Ingredient[],
  user: readonly Ingredient[],
): Ingredient[] {
  return mergeAll(bundled, user).filter((i) => !i.archived);
}

export interface Catalogue {
  /** For choosing: archived ingredients left out. */
  catalogue: Ingredient[];
  /**
   * For looking up: archived ingredients kept, so archiving one never turns
   * past meals into "Unknown ingredient" or takes them out of a day's totals.
   */
  all: Ingredient[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useCatalogue(): Catalogue {
  const [all, setAll] = useState<Ingredient[]>(() => mergeAll(INGREDIENTS, []));
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);

  const fetchAndMerge = useCallback(
    async (gen: number) => {
      try {
        const user = await listUserIngredients();
        // Only apply this result if the generation is still current
        if (gen === generationRef.current) {
          setAll(mergeAll(INGREDIENTS, user));
        }
      } catch {
        /* storage unavailable: the bundled catalogue still works */
      } finally {
        // Only clear loading if this generation is still current
        if (gen === generationRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const gen = generationRef.current;
    fetchAndMerge(gen);
    return () => {
      generationRef.current += 1;
    };
  }, [fetchAndMerge]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchAndMerge(gen);
  }, [fetchAndMerge]);

  const catalogue = useMemo(() => all.filter((i) => !i.archived), [all]);
  return { catalogue, all, loading, refresh };
}
