import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { mergeCatalogue, useCatalogue } from './useCatalogue';
import { zeroNutrients } from '../core/nutrients';
import { db } from '../storage/db';
import { saveUserIngredient } from '../storage/userIngredients';
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
});
