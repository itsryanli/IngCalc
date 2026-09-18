import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchCard } from './BatchCard';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import * as kitchen from '../../storage/kitchen';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-19' },
  createdAt: 0, ...over,
});

const session = (id: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId: 'b1', method: 'roasted', rawUsedG: g(400), cookedWeightG: g(284),
  cookedRemainingG: g(284), cookedAt: '2026-09-19', portionCount: 2,
  excludeFromCalibration: false, ...over,
});

const props = {
  ingredient: bundled('chicken-breast'),
  onChanged: vi.fn(), onCook: vi.fn(), onEditBatch: vi.fn(), onEditSession: vi.fn(),
};

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('BatchCard', () => {
  it('shows the purchase, its state and what is left to cook', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[]} />);
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Raw');
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent('1,000g');
    expect(screen.getByTestId('batch-purchase')).toHaveTextContent('Pasar Chow Kit');
    expect(screen.getByTestId('batch-purchase')).toHaveTextContent('RM20.00');
  });

  it('shows protein per ringgit before anything is cooked, which is the buying number', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[]} />);
    // 1000g of chicken breast at 22.5g/100g = 225g protein for RM20 = 11.25,
    // rendered to one decimal.
    expect(screen.getByTestId('batch-cost')).toHaveTextContent('11.3');
  });

  it('reports the state as part cooked once some is used', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} />);
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Part cooked');
    expect(screen.getByTestId('batch-remaining')).toHaveTextContent('600g');
  });

  it('renders a single cook flat, with no list around it', () => {
    // The parent spec: a batch cooked in one sitting must not show the extra
    // structure that multiple sittings need.
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByTestId('session-summary')).toBeInTheDocument();
  });

  it('renders several cooks as a list', () => {
    const sessions = [session('s1', { rawUsedG: g(400) }), session('s2', { rawUsedG: g(600) })];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByTestId('session-summary')).toHaveLength(2);
  });

  it('ignores sessions belonging to other batches', () => {
    const sessions = [session('s1'), { ...session('s9'), batchId: 'b2' }];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    expect(screen.getAllByTestId('session-summary')).toHaveLength(1);
  });

  it('offers to cook while raw weight is left', () => {
    const onCook = vi.fn();
    render(<BatchCard {...props} batch={batch()} sessions={[]} onCook={onCook} />);
    fireEvent.click(screen.getByRole('button', { name: /cook/i }));
    expect(onCook).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  });

  it('stops offering to cook once the batch is used up', () => {
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1', { rawUsedG: g(1000) })]} />);
    expect(screen.queryByRole('button', { name: /cook/i })).toBeNull();
  });

  it('names what a delete will take with it', () => {
    const sessions = [session('s1', { rawUsedG: g(400) }), session('s2', { rawUsedG: g(300) })];
    render(<BatchCard {...props} batch={batch()} sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));
    // Not role="alert": a question sitting next to its own buttons is not an
    // assertive announcement. role="alert" is reserved for the write error.
    const prompt = screen.getByText(/delete this batch/i);
    expect(prompt).toHaveTextContent('2 cooks');
    expect(prompt).toHaveTextContent('568g');
  });

  it('deletes the batch and its cooks on confirmation', async () => {
    await db.batches.put(batch());
    await db.cookSessions.put(session('s1'));
    const onChanged = vi.fn();
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await db.batches.toArray()).toEqual([]);
    expect(await db.cookSessions.toArray()).toEqual([]);
  });

  it('surfaces a failed delete instead of silently doing nothing', async () => {
    // Precedent: Phase 1's AddIngredientScreen and Tasks 10-13 all wrap the
    // storage write, surface the failure, and withhold onChanged so a
    // storage-refresh callback (Task 15) does not re-read believing the
    // delete succeeded.
    vi.spyOn(kitchen, 'deleteBatchCascade').mockRejectedValue(new Error('boom'));
    const onChanged = vi.fn();
    render(<BatchCard {...props} batch={batch()} sessions={[session('s1')]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /delete batch/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('still works when the ingredient has been archived out of the catalogue', () => {
    // Ingredients are archived, never deleted, precisely because batches
    // reference them — but an archived one is filtered out of the catalogue,
    // so the card must not assume it can be found.
    render(<BatchCard {...props} ingredient={null} batch={batch()} sessions={[]} />);
    expect(screen.getByTestId('batch-name')).toHaveTextContent(/no longer in your list/i);
    expect(screen.queryByTestId('batch-cost')).toBeNull();
    expect(screen.getByRole('button', { name: /delete batch/i })).toBeInTheDocument();
  });
});
