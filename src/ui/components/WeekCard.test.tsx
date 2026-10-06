import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { WeekCard } from './WeekCard';
import { db } from '../../storage/db';
import { dayLogId } from '../../storage/meals';
import { saveSettings, getSettings } from '../../storage/settings';
import { zeroNutrients } from '../../core/nutrients';
import { g, myr } from '../../core/units';
import type { Batch, Ingredient, MealEntry } from '../../core/types';
import type { MealContext } from '../../core/meals';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { RETENTION } from '../../data/retentionTable';

const tempeh: Ingredient = {
  id: 'tempeh', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false,
};
const batch: Batch = {
  id: 'b', ingredientId: 'tempeh', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(8), location: 'Pasar Seri', date: '2026-10-05' }, createdAt: 1,
};
const ctx: MealContext = {
  sessions: [], batches: [batch], ingredientById: (id) => (id === 'tempeh' ? tempeh : undefined),
  samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION,
};
const quick = (date: string, proteinG: number, profileId = 'p'): MealEntry => ({
  id: `${profileId}-${date}`, profileId, date, label: 'lunch', createdAt: 1,
  kind: 'quick', name: 'x', kcal: 2000, proteinG,
});
const targets = { kcal: 2000, proteinG: 100, micros: {} };

beforeEach(async () => {
  await db.dayLogs.clear();
  await db.settings.clear();
});

const renderWeek = (entries: MealEntry[]) => render(
  <WeekCard profileId="p" endDate="2026-10-06" entries={entries} batches={[batch]} samples={[]} ctx={ctx} version={0} />,
);

describe('WeekCard', () => {
  it('shows a dot per day: reached, logged, or nothing logged', async () => {
    for (const date of ['2026-10-05', '2026-10-06']) {
      await db.dayLogs.put({ id: dayLogId('p', date), profileId: 'p', date, targets });
    }
    renderWeek([quick('2026-10-05', 120), quick('2026-10-06', 60), quick('2026-10-06', 999, 'someone-else')]);
    expect(await screen.findByTestId('week-protein')).toHaveTextContent('Protein target reached on 1 of the 2 days you logged.');
    const dots = screen.getAllByRole('img');
    expect(dots).toHaveLength(7);
    expect(dots[5]!.getAttribute('aria-label')).toMatch(/protein target reached/);
    expect(dots[6]!.getAttribute('aria-label')).toMatch(/: logged$/);
    expect(dots[0]!.getAttribute('aria-label')).toMatch(/nothing logged/);
  });

  it('says plainly when nothing was logged, with no streak to break', () => {
    renderWeek([]);
    expect(screen.getByText('Nothing logged in these seven days yet.')).toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
  });

  it('shows spending and the best protein for the money', () => {
    renderWeek([]);
    expect(screen.getByTestId('week-spent')).toHaveTextContent('RM8.00');
    // 1 kg of tempeh at 20 g/100 g for RM8 = 25 g protein per RM.
    expect(screen.getByTestId('week-best')).toHaveTextContent('Tempeh at Pasar Seri, 25.0 g per RM');
    expect(screen.getByTestId('week-best')).toHaveTextContent('your best yet');
  });

  it('shows milestones once reached', async () => {
    await saveSettings({ ...(await getSettings()), lastBackupAt: 1 });
    renderWeek([]);
    expect(await screen.findByText('First backup made')).toBeInTheDocument();
  });
});
