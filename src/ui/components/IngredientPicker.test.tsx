import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

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

describe('IngredientPicker recent ingredients', () => {
  const open = () => fireEvent.focus(screen.getByRole('combobox', { name: /ingredient/i }));
  const names = () => screen.getAllByRole('option').map((o) => o.textContent);

  it('lists recent ingredients first, marked, before anything is typed', () => {
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()}
                             recentIds={['kangkung', 'brown-rice']} />);
    open();
    expect(names().slice(0, 3)).toEqual([
      'Kangkung (water spinach)Recent', 'Brown rice, long grainRecent', 'Chicken breast, skinless',
    ]);
    // Listed once, not again further down.
    expect(names().filter((n) => n?.startsWith('Kangkung'))).toHaveLength(1);
  });

  it('keeps the recent tag out of the option name, so it reads as the ingredient', () => {
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()}
                             recentIds={['kangkung']} />);
    open();
    expect(screen.getByRole('option', { name: 'Kangkung (water spinach)' })).toBeInTheDocument();
  });

  it('lets the search alone decide once something is typed', () => {
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()}
                             recentIds={['kangkung']} />);
    open();
    fireEvent.change(screen.getByRole('combobox', { name: /ingredient/i }), { target: { value: 'chicken' } });
    expect(names()[0]).toBe('Chicken breast, skinless');
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('ignores a recent id that is no longer in the list, such as an archived ingredient', () => {
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()}
                             recentIds={['gone', 'bendi']} />);
    open();
    expect(names()[0]).toBe('Bendi (okra), rawRecent');
  });
});

describe('IngredientPicker online search', () => {
  const setOnline = (on: boolean) => {
    Object.defineProperty(navigator, 'onLine', { value: on, configurable: true });
    window.dispatchEvent(new Event(on ? 'online' : 'offline'));
  };
  const typeIn = (text: string) => {
    const input = screen.getByRole('combobox', { name: /ingredient/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: text } });
  };

  it('offers "Search online for …" below "Add …" while online', () => {
    setOnline(true);
    const onAddNew = vi.fn();
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={onAddNew} />);
    typeIn('Zus latte');
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options.slice(-2)).toEqual(['Add "Zus latte"', 'Search online for “Zus latte”']);
    press(screen.getByRole('option', { name: 'Search online for “Zus latte”' }));
    expect(onAddNew).toHaveBeenCalledWith('Zus latte', true);
  });

  it('does not show it offline, and brings it back when the connection returns', () => {
    setOnline(false);
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()} />);
    typeIn('Zus latte');
    expect(screen.queryByRole('option', { name: /search online/i })).not.toBeInTheDocument();
    act(() => setOnline(true));
    expect(screen.getByRole('option', { name: /search online/i })).toBeInTheDocument();
  });

  it('does not show it before anything is typed, or where a form turns it off', () => {
    setOnline(true);
    const { unmount } = render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox', { name: /ingredient/i }));
    expect(screen.queryByRole('option', { name: /search online/i })).not.toBeInTheDocument();
    unmount();
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={vi.fn()} searchOnline={false} />);
    typeIn('Zus latte');
    expect(screen.queryByRole('option', { name: /search online/i })).not.toBeInTheDocument();
  });

  it('reaches the search row with the arrow keys', () => {
    setOnline(true);
    const onAddNew = vi.fn();
    render(<IngredientPicker catalogue={CATALOGUE} value="" onChange={vi.fn()} onAddNew={onAddNew} />);
    typeIn('zzz');
    const input = screen.getByRole('combobox', { name: /ingredient/i });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddNew).toHaveBeenCalledWith('zzz', true);
  });
});
