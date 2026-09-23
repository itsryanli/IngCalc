import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostsScreen } from './CostsScreen';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';
import type { Batch } from '../../core/types';

vi.mock('../download', () => ({ downloadText: vi.fn() }));
import { downloadText } from '../download';

const TODAY = new Date(2026, 8, 23);

const batch = (id: string, date: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date }, createdAt: Number(id.replace(/\D/g, '')) || 0,
  ...over,
});

const renderScreen = () => render(<CostsScreen profiles={[]} onDataReplaced={() => {}} today={TODAY} />);
const bodyRows = async () =>
  within(await screen.findByTestId('purchase-table')).getAllByRole('row').slice(1);

beforeEach(async () => {
  vi.mocked(downloadText).mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('CostsScreen', () => {
  it('points an empty device at Kitchen, and still offers restore', async () => {
    renderScreen();
    expect(await screen.findByTestId('costs-empty')).toHaveTextContent(
      'Nothing bought yet — purchases you log in Kitchen appear here.',
    );
    expect(screen.getByLabelText(/restore from backup/i)).toBeInTheDocument();
  });

  it('says so when nothing was bought in the chosen period', async () => {
    await db.batches.put(batch('b1', '2026-07-10'));
    renderScreen();
    expect(await screen.findByTestId('costs-none-in-range')).toHaveTextContent('Nothing bought in this period.');
  });

  it('scopes the table to the range and widens it on request', async () => {
    await db.batches.bulkPut([batch('b1', '2026-09-10'), batch('b2', '2026-07-10')]);
    renderScreen();
    expect(await bodyRows()).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 3 months' }));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
  });

  it('summarises the range with a weighted protein figure', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    // 1000g × 22.5% = 225g protein for RM20.
    expect(await screen.findByTestId('costs-summary')).toHaveTextContent('RM20.00 · 1 purchase · 11.3 g protein per RM');
  });

  it('names a purchase of an archived ingredient', async () => {
    await db.userIngredients.put({
      id: 'u-tempeh', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
      publishedYield: {}, absorbsWater: false, source: 'user', archived: true,
    });
    await db.batches.put(batch('b1', '2026-09-10', { ingredientId: 'u-tempeh' }));
    renderScreen();
    await waitFor(async () => {
      expect(within((await bodyRows())[0]!).getByRole('rowheader')).toHaveTextContent('Tempeh');
    });
  });

  it('shows totals by location and by month', async () => {
    await db.batches.bulkPut([batch('b1', '2026-09-10'), batch('b2', '2026-09-12', { purchase: { pricePaidMYR: myr(5), location: 'Tesco', date: '2026-09-12' } })]);
    renderScreen();
    const byLocation = await screen.findByTestId('totals-location');
    expect(within(byLocation).getByRole('row', { name: /Pasar/ })).toHaveTextContent('RM20.00');
    expect(within(screen.getByTestId('totals-month')).getByRole('row', { name: /Sep 2026/ })).toHaveTextContent('RM25.00');
  });

  it('exports the purchases in view, named for the range', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    await screen.findByTestId('purchase-table');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export purchases (CSV)' }));
    const [name, mime, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-purchases-2026-09.csv');
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(text.startsWith('﻿date,ingredient,location')).toBe(true);
    expect(text).toContain('b1');
  });

  it('disables the meals export when no meal falls in the range', async () => {
    await db.batches.put(batch('b1', '2026-09-10'));
    renderScreen();
    await screen.findByTestId('purchase-table');
    expect(screen.getByRole('button', { name: 'Export meals (CSV)' })).toBeDisabled();
  });

  it('exports meals with the profile name', async () => {
    await db.mealEntries.put({
      id: 'q1', profileId: 'p1', date: '2026-09-20', label: 'snack', createdAt: 1,
      kind: 'quick', name: 'Teh tarik', kcal: 120,
    });
    render(
      <CostsScreen
        profiles={[{ id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' }]}
        onDataReplaced={() => {}}
        today={TODAY}
      />,
    );
    const button = screen.getByRole('button', { name: 'Export meals (CSV)' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    const [name, , text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-meals-2026-09.csv');
    expect(text).toContain('2026-09-20,Ali,snack,quick,Teh tarik,,,120,,,');
  });
});
