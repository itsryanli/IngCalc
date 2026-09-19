import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { AddEntryForm } from './AddEntryForm';
import { db } from '../../storage/db';
import type { Batch, CookSession, Ingredient, MealEntry } from '../../core/types';
import type { MealContext } from '../../core/meals';
import { g } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';

// Fixtures adapted from src/core/meals.test.ts — copied rather than shared,
// since these two files are allowed to diverge.
const chicken: Ingredient = {
  id: 'chicken', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), kcal: 120, protein: 22.5, potassium: 334, iron: 0.7 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false, source: 'usda', archived: false,
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken', rawWeightG: g(1000),
  purchase: { pricePaidMYR: 20 as never, location: 'Jaya Grocer', date: '2026-09-18' },
  createdAt: 1,
};

// 400g raw roasted to 284g, cut into 4 portions of 71g.
const session: CookSession = {
  id: 's1', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
};

// A second cook, fully spoken for by an existing entry in some tests.
const session2: CookSession = {
  id: 's2', batchId: 'b1', method: 'roasted',
  rawUsedG: g(400), cookedWeightG: g(284),
  cookedAt: '2026-09-18', portionCount: 4, excludeFromCalibration: false,
};

const RETENTION = { meat: { roasted: { protein: 0.98, potassium: 0.85 } } };
const CATEGORY_YIELD = { meat: { roasted: 0.71, boiled: 0.7, steamed: 0.75, panFried: 0.72,
  stirFried: 0.73, deepFried: 0.74, grilled: 0.71 } } as never;

const ctx: MealContext = {
  sessions: [session, session2], batches: [batch],
  ingredientById: (id) => (id === 'chicken' ? chicken : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION as never,
};

const targets = { kcal: 2310, proteinG: 120, micros: {} };

let nextId = 1;

const weightEntry = (over: Partial<MealEntry> = {}): MealEntry => ({
  id: `entry-${nextId++}`, profileId: 'p1', date: '2026-09-19', label: 'lunch',
  createdAt: nextId, kind: 'weight', cookSessionId: 's1', grams: g(1),
  ...over,
} as MealEntry);

type Props = ComponentProps<typeof AddEntryForm>;

const renderForm = (over: Partial<Props> = {}) => {
  const props: Props = {
    profileId: 'p1', date: '2026-09-19', label: 'lunch',
    ctx, catalogue: [chicken],
    allEntries: [], targets,
    editing: undefined,
    onSaved: vi.fn(), onCancel: vi.fn(),
    ...over,
  };
  return render(<AddEntryForm {...props} />);
};

// The ingredient control is a typeahead combobox, not a <select>, so options
// activate on mousedown (the input's blur would otherwise close the list
// before a click landed) — following CalcScreen.test.tsx's pattern.
const press = (el: HTMLElement) => fireEvent.mouseDown(el);

const pickIngredient = async (labelText: string | RegExp) => {
  const input = await screen.findByRole('combobox', { name: /ingredient/i });
  fireEvent.focus(input);
  press(await screen.findByRole('option', { name: labelText }));
};

const enterWeight = async (grams: number) => {
  const input = screen.getByLabelText(/how much did you eat/i);
  await userEvent.clear(input);
  await userEvent.type(input, `${grams}`);
};

describe('AddEntryForm', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); await db.dayLogs.clear(); });

  it('offers the three sources', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /from the kitchen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /any ingredient/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick add/i })).toBeInTheDocument();
  });

  it('lists only cooks with something left', () => {
    // session s1 has 284g; s2 is fully eaten via an existing entry.
    renderForm({ allEntries: [weightEntry({ cookSessionId: 's2', grams: g(284) })] });
    expect(screen.getByTestId('available-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('available-s2')).toBeNull();
  });

  it('keeps a fully-eaten cook in the available list while editing the very entry eating it', () => {
    // The only thing consuming s1's 284g is the entry now being edited. The
    // available-cooks list must measure the remainder against `others`
    // (allEntries minus the entry being edited), not the raw `allEntries` —
    // otherwise the row the user is trying to edit disappears out from under them.
    const existing = weightEntry({ id: 'm1', cookSessionId: 's1', grams: g(284) });
    renderForm({ editing: existing, allEntries: [existing] });
    expect(screen.getByTestId('available-s1')).toBeInTheDocument();
  });

  it('logs one portion from the kitchen', async () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written).toMatchObject({ kind: 'portion', cookSessionId: 's1', portions: 1, label: 'lunch' });
    expect(onSaved).toHaveBeenCalled();
  });

  it('writes the day log with the first entry', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [log] = await db.dayLogs.toArray();
    expect(log!.id).toBe('p1:2026-09-19');
    expect(log!.targets.kcal).toBe(2310);
  });

  it('refuses more than is left, and writes nothing', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /a weighed amount/i }));
    await userEvent.type(screen.getByLabelText(/how much/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('284g');
    expect(await db.mealEntries.count()).toBe(0);
  });

  it('shows what an ingredient entry comes to before it is saved', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /any ingredient/i }));
    await pickIngredient('Chicken breast');
    // The fixture only calibrates a roasted yield (0.71) for chicken; the form
    // defaults the method select to 'boiled', which falls through to the
    // category default instead and would not reproduce meals.test.ts's 44.1g.
    fireEvent.change(screen.getByLabelText(/how was it cooked/i), { target: { value: 'roasted' } });
    await enterWeight(142);

    // The readout is the whole reason Calc's hand-off was removed: the form
    // answers the question you would otherwise have gone to Calc to ask.
    expect(screen.getByTestId('entry-preview')).toHaveTextContent('44');
  });

  it('shows a live preview for the kitchen source, not only ingredient', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('available-s1'));
    // Default portions is '1': a quarter of s1's pan — 120 kcal, 22g protein
    // (meals.test.ts's own figures for this fixture's portion entry).
    expect(screen.getByTestId('entry-preview')).toHaveTextContent('22');
  });

  it('shows a live preview for the quick-add source, not only ingredient', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/calories/i), '180');
    expect(screen.getByTestId('entry-preview')).toHaveTextContent('180');
  });

  it('logs a quick entry with no protein figure', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/what was it/i), 'Teh tarik');
    await userEvent.type(screen.getByLabelText(/calories/i), '180');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written).toMatchObject({ kind: 'quick', name: 'Teh tarik', kcal: 180 });
    expect((written as { proteinG?: number }).proteinG).toBeUndefined();
  });

  it('refuses a quick entry with no name', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/calories/i), '180');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await db.mealEntries.count()).toBe(0);
  });

  it('keeps the id and the created time when editing', async () => {
    const existing = weightEntry({ id: 'm1', grams: g(50), createdAt: 999 });
    await db.mealEntries.put(existing);
    renderForm({ editing: existing, allEntries: [existing] });

    await userEvent.clear(screen.getByLabelText(/how much/i));
    await userEvent.type(screen.getByLabelText(/how much/i), '60');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [written] = await db.mealEntries.toArray();
    expect(written!.id).toBe('m1');
    expect(written!.createdAt).toBe(999);
    expect(await db.mealEntries.count()).toBe(1);
  });

  it('measures an edit against the remainder excluding itself', async () => {
    // 250g of a 284g cook already eaten by this very entry; growing it to 260g fits.
    const existing = weightEntry({ id: 'm1', grams: g(250) });
    renderForm({ editing: existing, allEntries: [existing] });

    await userEvent.clear(screen.getByLabelText(/how much/i));
    await userEvent.type(screen.getByLabelText(/how much/i), '260');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not report success when the write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByTestId('available-s1'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    await db.open();
  });
});
