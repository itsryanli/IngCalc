import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Options are activated on mousedown, not click: the input's blur would otherwise
// close the listbox before a click could land on it. fireEvent.click fires ONLY a
// click event, so it simulates something a browser never produces — a real press is
// mousedown -> mouseup -> click. press() reproduces the part the component listens for.
const press = (el: HTMLElement) => fireEvent.mouseDown(el);
import { IngredientPicker } from './IngredientPicker';
import { rankIngredients } from '../rankIngredients';
import { zeroNutrients } from '../../core/nutrients';
import type { Ingredient } from '../../core/types';

const make = (id: string, name: string): Ingredient => ({
  id, name, category: 'vegetable', per100gRaw: zeroNutrients(),
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false,
});

const CATALOGUE: Ingredient[] = [
  make('chicken-breast', 'Chicken breast, skinless'),
  make('chicken-thigh', 'Chicken thigh, boneless, skinless'),
  make('bendi', 'Bendi (okra), raw'),
  make('kangkung', 'Kangkung (water spinach)'),
  make('brown-rice', 'Brown rice, long grain'),
];

describe('rankIngredients', () => {
  it('returns everything when the query is empty', () => {
    expect(rankIngredients(CATALOGUE, '')).toHaveLength(5);
  });

  it('matches case-insensitively', () => {
    expect(rankIngredients(CATALOGUE, 'BENDI').map((i) => i.id)).toEqual(['bendi']);
  });

  it('matches an English alias held inside the name', () => {
    // The dataset embeds aliases: "Bendi (okra), raw". Typing the English word
    // has to find the Malaysian entry or the picker is useless to half its users.
    expect(rankIngredients(CATALOGUE, 'okra').map((i) => i.id)).toEqual(['bendi']);
    expect(rankIngredients(CATALOGUE, 'spinach').map((i) => i.id)).toEqual(['kangkung']);
  });

  it('matches multiple words in any order', () => {
    expect(rankIngredients(CATALOGUE, 'breast chicken').map((i) => i.id)).toEqual(['chicken-breast']);
  });

  it('ranks a name that starts with the query above one that merely contains it', () => {
    // "rice" starts "Brown rice"? No — but it appears in it. Use a query where both apply.
    const ranked = rankIngredients(CATALOGUE, 'chicken');
    expect(ranked[0]?.id).toBe('chicken-breast');
  });

  it('ranks a leading-word match above a mid-name match', () => {
    const cat = [make('a', 'Wild brown trout'), make('b', 'Brown rice, long grain')];
    expect(rankIngredients(cat, 'brown').map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('returns nothing when no name contains every word', () => {
    expect(rankIngredients(CATALOGUE, 'chicken rice')).toEqual([]);
  });
});

describe('IngredientPicker', () => {
  const setup = (over: Partial<Parameters<typeof IngredientPicker>[0]> = {}) => {
    const onChange = vi.fn();
    const onAddNew = vi.fn();
    render(
      <IngredientPicker
        catalogue={CATALOGUE}
        value={over.value ?? ''}
        onChange={onChange}
        onAddNew={onAddNew}
      />,
    );
    return { onChange, onAddNew, input: screen.getByRole('combobox', { name: /ingredient/i }) };
  };

  it('lists every ingredient when focused with nothing typed', () => {
    const { input } = setup();
    fireEvent.focus(input);
    const list = screen.getByRole('listbox');
    // 5 ingredients plus the persistent "add" row.
    expect(within(list).getAllByRole('option')).toHaveLength(6);
  });

  it('filters the list as the user types', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'chicken' } });
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(names.some((n) => n?.includes('Chicken breast'))).toBe(true);
    expect(names.some((n) => n?.includes('Kangkung'))).toBe(false);
  });

  it('reports the chosen id when an option is clicked', () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'okra' } });
    press(screen.getByRole('option', { name: /Bendi/ }));
    expect(onChange).toHaveBeenCalledWith('bendi');
  });

  it('offers to add the typed name when nothing matches, and passes it along', () => {
    const { input, onAddNew } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Petai' } });
    press(screen.getByRole('option', { name: /Add "Petai"/ }));
    // The typed text becomes the new ingredient's starting name — the whole point
    // of typing rather than picking.
    expect(onAddNew).toHaveBeenCalledWith('Petai');
  });

  it('still offers to add when nothing is typed', () => {
    const { input, onAddNew } = setup();
    fireEvent.focus(input);
    press(screen.getByRole('option', { name: /Add a new ingredient/i }));
    expect(onAddNew).toHaveBeenCalledWith('');
  });

  it('selects with the keyboard', () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'okra' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('bendi');
  });

  it('closes on Escape without choosing anything', () => {
    const { input, onChange } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'okra' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the selected ingredient name when one is already chosen', () => {
    const { input } = setup({ value: 'kangkung' });
    expect(input).toHaveValue('Kangkung (water spinach)');
  });
});
