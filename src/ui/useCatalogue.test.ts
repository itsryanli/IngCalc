import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { mergeAll, mergeCatalogue, useCatalogue } from './useCatalogue';
import { zeroNutrients } from '../core/nutrients';
import { db } from '../storage/db';
import { saveUserIngredient } from '../storage/userIngredients';
import * as userIngredientsModule from '../storage/userIngredients';
import type { Ingredient } from '../core/types';

const make = (id: string, name: string, over: Partial<Ingredient> = {}): Ingredient => ({
  id, name, category: 'vegetable', per100gRaw: zeroNutrients(),
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false, ...over,
});

describe('mergeCatalogue', () => {
  it('combines bundled and user ingredients', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('b', 'Banana', { source: 'user' })]);
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('sorts by name', () => {
    const r = mergeCatalogue([make('z', 'Zucchini'), make('a', 'Apple')], []);
    expect(r.map((i) => i.name)).toEqual(['Apple', 'Zucchini']);
  });

  it('lets a user entry override a bundled one with the same id', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('a', 'My apple', { source: 'user' })]);
    expect(r.length).toBe(1);
    expect(r[0]!.name).toBe('My apple');
  });

  it('excludes archived entries', () => {
    const r = mergeCatalogue([make('a', 'Apple')], [make('b', 'Bad', { source: 'user', archived: true })]);
    expect(r.map((i) => i.id)).toEqual(['a']);
  });
});

describe('mergeAll', () => {
  it('keeps archived entries, for looking up what past meals used', () => {
    const r = mergeAll([make('a', 'Apple')], [make('b', 'Bad', { source: 'user', archived: true })]);
    expect(r.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('useCatalogue hook', () => {
  beforeEach(async () => {
    await db.userIngredients.clear();
  });

  it('loads bundled ingredients on mount', async () => {
    const { result } = renderHook(() => useCatalogue());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.catalogue.length).toBeGreaterThan(0);
  });

  it('refresh re-reads user ingredients from storage', async () => {
    const { result } = renderHook(() => useCatalogue());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const initialLength = result.current.catalogue.length;

    // Save a new user ingredient
    const newIngredient = make('test-ing', 'Test Ingredient', { source: 'user' });
    await saveUserIngredient(newIngredient);

    // Call refresh and wait for state update
    await act(async () => {
      await result.current.refresh();
    });

    // Wait for the state update to be reflected
    await waitFor(() => {
      expect(result.current.catalogue.length).toBe(initialLength + 1);
    });

    // Verify the new ingredient appears in the catalogue
    const found = result.current.catalogue.find((i) => i.id === 'test-ing');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Test Ingredient');
  });

  it('refresh result is not clobbered by slow initial load resolving late', async () => {
    // This test demonstrates the race condition: if the mount's initial load
    // is slow and resolves after a refresh call, it could overwrite the refresh
    // result with stale data. The generation guard should prevent this.

    let resolveSlowLoad: ((value: Ingredient[]) => void) = null as any;
    let resolveQuickLoad: ((value: Ingredient[]) => void) = null as any;

    const slowLoadPromise = new Promise<Ingredient[]>((resolve) => {
      resolveSlowLoad = resolve;
    });

    const quickLoadPromise = new Promise<Ingredient[]>((resolve) => {
      resolveQuickLoad = resolve;
    });

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockListUserIngredients: any = vi.spyOn(userIngredientsModule as any, 'listUserIngredients').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call (mount) - slow
        return slowLoadPromise;
      } else {
        // Second call (refresh) - quick
        return quickLoadPromise;
      }
    });

    try {
      // Mount the hook - initial load starts but is slow
      const { result } = renderHook(() => useCatalogue());
      expect(result.current.loading).toBe(true);

      // Before the initial load resolves, call refresh
      await act(async () => {
        const refreshPromise = result.current.refresh();

        // Resolve the refresh call quickly with a specific ingredient
        const refreshData = [make('from-refresh', 'From Refresh', { source: 'user' })];
        resolveQuickLoad(refreshData);

        // Wait for refresh to complete
        await refreshPromise;
      });

      // Now resolve the slow initial load (this comes late)
      const slowData = [make('from-slow-load', 'From Slow Load', { source: 'user' })];
      resolveSlowLoad(slowData);

      // Wait a bit to let the slow load settle
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 1000 });

      // The catalogue should have the refresh result, not the slow load
      // If the bug exists, the slow load will overwrite refresh and we'll see "From Slow Load"
      const hasRefreshResult = result.current.catalogue.some((i) => i.id === 'from-refresh');
      const hasSlowLoadResult = result.current.catalogue.some((i) => i.id === 'from-slow-load');

      // The refresh result MUST be present; the slow load must NOT overwrite it
      expect(hasRefreshResult).toBe(true);
      expect(hasSlowLoadResult).toBe(false);
    } finally {
      mockListUserIngredients.mockRestore();
    }
  });
});
