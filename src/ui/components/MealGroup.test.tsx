import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { MealGroup } from './MealGroup';
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

const portionEntry: MealEntry = {
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'portion', cookSessionId: 's1', portions: 1,
};

const quickEntry: MealEntry = {
  id: 'm2', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 2,
  kind: 'quick', name: 'Teh tarik', kcal: 180, proteinG: 4,
};

describe('MealGroup', () => {
  it('names the meal and offers to add to it', async () => {
    const onAdd = vi.fn();
    render(<MealGroup label="lunch" entries={[]} ctx={ctx} onAdd={onAdd}
                      onEdit={() => {}} onChanged={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Lunch' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add to lunch/i }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders a row per entry', () => {
    render(<MealGroup label="lunch" entries={[portionEntry, quickEntry]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.getAllByTestId('entry-description')).toHaveLength(2);
  });

  it('shows the meal\'s own calorie subtotal once it has entries', () => {
    render(<MealGroup label="lunch" entries={[quickEntry]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.getByTestId('group-subtotal-lunch')).toHaveTextContent('180');
  });

  it('shows no subtotal for an empty meal', () => {
    render(<MealGroup label="dinner" entries={[]} ctx={ctx}
                      onAdd={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect(screen.queryByTestId('group-subtotal-dinner')).toBeNull();
  });
});
