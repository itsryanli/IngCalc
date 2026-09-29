import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { EntryRow } from './EntryRow';
import { db } from '../../storage/db';
import { addEntry, dayLogId } from '../../storage/meals';
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

const RETENTION = { meat: { roasted: { protein: 0.98, potassium: 0.85 } } };
const CATEGORY_YIELD = { meat: { roasted: 0.71, boiled: 0.7, steamed: 0.75, panFried: 0.72,
  stirFried: 0.73, deepFried: 0.74, grilled: 0.71 } } as never;

const ctx: MealContext = {
  sessions: [session], batches: [batch],
  ingredientById: (id) => (id === 'chicken' ? chicken : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION as never,
};

// One of the session's four 71g portions: a quarter of 88.2g retained protein.
const portionEntry: MealEntry = {
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1,
};

describe('EntryRow', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); });

  it('describes the entry and what it was worth', () => {
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={() => {}} />);
    expect(screen.getByTestId('entry-description')).toHaveTextContent('Chicken breast');
    expect(screen.getByTestId('entry-detail')).toHaveTextContent('Roasted · 1 portion');
    expect(screen.getByTestId('entry-nutrients')).toHaveTextContent('22g');
  });

  it('asks before deleting, as a plain question rather than an alert', async () => {
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByText(/remove this from the day/i)).toBeInTheDocument();
    // Execution record §3.5: role="alert" means a write failed, never a question.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deletes and reports back', async () => {
    await addEntry(portionEntry, { id: dayLogId('p1', '2026-09-19'), profileId: 'p1',
      date: '2026-09-19', targets: { kcal: 2000, proteinG: 150, micros: {} } });
    const onDeleted = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, remove it/i }));

    expect(await db.mealEntries.count()).toBe(0);
    expect(onDeleted).toHaveBeenCalled();
  });

  it('does not report back when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    const onDeleted = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={() => {}} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, remove it/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // The callback is proof the row is gone; screens refresh on it.
    expect(onDeleted).not.toHaveBeenCalled();
    await db.open();
  });

  it('hands the entry back for editing', async () => {
    const onEdit = vi.fn();
    render(<EntryRow entry={portionEntry} ctx={ctx} onEdit={onEdit} onDeleted={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(portionEntry);
  });
});
