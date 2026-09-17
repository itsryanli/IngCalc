import { useEffect, useState, useRef, useCallback } from 'react';
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
  const generationRef = useRef(0);

  const fetchAndMerge = useCallback(
    async (gen: number) => {
      try {
        const user = await listUserIngredients();
        // Only apply this result if the generation is still current
        if (gen === generationRef.current) {
          setCatalogue(mergeCatalogue(INGREDIENTS, user));
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

  return { catalogue, loading, refresh };
}
