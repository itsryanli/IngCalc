import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DishForm } from './DishForm';
import { db } from '../../storage/db';
import { INGREDIENTS } from '../../data/ingredients';
import { g } from '../../core/units';
import type { Ingredient } from '../../core/types';

const press = (el: HTMLElement) => fireEvent.mouseDown(el);
const bundled = (id: string) => INGREDIENTS.find((i) => i.id === id)!;

const pick = async (row: number, name: RegExp) => {
  const item = screen.getByTestId(`dish-item-${row}`);
  fireEvent.focus(within(item).getByRole('combobox', { name: /ingredient/i }));
  press(await within(item).findByRole('option', { name }));
};
const weigh = (row: number, grams: string) =>
  fireEvent.change(within(screen.getByTestId(`dish-item-${row}`)).getByLabelText(/how much went in/i), { target: { value: grams } });

const base = {
  catalogue: INGREDIENTS, all: INGREDIENTS, onCancel: vi.fn(), onCatalogueChanged: vi.fn(),
};

const bread: Ingredient = {
  id: 'my-bread', name: 'Seeded bread', category: 'other', per100gRaw: bundled('wheat-flour').per100gRaw,
  publishedYield: {}, absorbsWater: false, defaultMethod: 'asIs', source: 'user', sourceRef: 'Your recipe', archived: false,
  recipe: { items: [{ ingredientId: 'wheat-flour', grams: g(500) }, { ingredientId: 'peanuts', grams: g(80) }], finishedWeightG: g(820) },
};

beforeEach(async () => { await db.userIngredients.clear(); });

describe('DishForm', () => {
  it('works out the dish per 100 g from what went in and the finished weight, then saves it', async () => {
    const onSaved = vi.fn();
    render(<DishForm {...base} mode="new" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/dish name/i), { target: { value: 'Seeded bread' } });
    await pick(1, /^Wheat flour/);
    weigh(1, '500');
    await pick(2, /^Peanuts/);
    weigh(2, '80');
    fireEvent.change(screen.getByLabelText(/finished weight/i), { target: { value: '820' } });

    const flour = bundled('wheat-flour').per100gRaw;
    const peanuts = bundled('peanuts').per100gRaw;
    const kcal = (flour.kcal * 5 + peanuts.kcal * 0.8) / 8.2;
    expect(screen.getByRole('status')).toHaveTextContent(`${Math.round(kcal)} kcal`);
    expect(screen.getByRole('status')).toHaveTextContent('weigh 580 g; the dish weighs 820 g');

    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved).toMatchObject({ name: 'Seeded bread', defaultMethod: 'asIs', sourceRef: 'Your recipe', source: 'user' });
    expect(saved.per100gRaw.kcal).toBeCloseTo(kcal, 6);
    expect(saved.recipe).toEqual({
      items: [{ ingredientId: 'wheat-flour', grams: 500 }, { ingredientId: 'peanuts', grams: 80 }], finishedWeightG: 820,
    });
  });

  it('ignores rows left empty, but asks for the finished weight', async () => {
    render(<DishForm {...base} mode="new" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/dish name/i), { target: { value: 'Oats' } });
    await pick(1, /^Rolled oats/);
    weigh(1, '100');
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Weigh the finished dish');
  });

  it('edits a dish in place, keeping its id and recipe', async () => {
    await db.userIngredients.put(bread);
    const onSaved = vi.fn();
    render(<DishForm {...base} mode="edit" dish={bread} onSaved={onSaved} />);
    expect(screen.getByLabelText(/finished weight/i)).toHaveValue(820);
    weigh(2, '100');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const all = await db.userIngredients.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('my-bread');
    expect(all[0]!.recipe!.items[1]!.grams).toBe(100);
  });

  it('records a new bake as a new version and archives the old one, so earlier slices keep their figures', async () => {
    await db.userIngredients.put(bread);
    const onSaved = vi.fn();
    render(<DishForm {...base} mode="again" dish={bread} onSaved={onSaved} />);
    expect(screen.getByRole('heading', { name: 'Made Seeded bread again' })).toBeInTheDocument();
    // The recipe is kept; only the new loaf needs weighing.
    expect(within(screen.getByTestId('dish-item-1')).getByLabelText(/how much went in/i)).toHaveValue(500);
    expect(screen.getByLabelText(/finished weight/i)).toHaveValue(0);
    fireEvent.change(screen.getByLabelText(/finished weight/i), { target: { value: '790' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const all = await db.userIngredients.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((i) => i.id === 'my-bread')!.archived).toBe(true);
    const fresh = all.find((i) => i.id !== 'my-bread')!;
    expect(fresh).toMatchObject({ name: 'Seeded bread', archived: false });
    expect(fresh.recipe!.finishedWeightG).toBe(790);
  });

  it('does not offer a dish as one of its own ingredients', async () => {
    render(<DishForm {...base} catalogue={[...INGREDIENTS, bread]} mode="edit" dish={bread} onSaved={vi.fn()} />);
    const item = screen.getByTestId('dish-item-1');
    const input = within(item).getByRole('combobox', { name: /ingredient/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Seeded' } });
    expect(within(item).queryByRole('option', { name: 'Seeded bread' })).not.toBeInTheDocument();
  });
});
