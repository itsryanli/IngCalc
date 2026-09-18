import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddBatchForm } from './AddBatchForm';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const catalogue: Ingredient[] = [{
  id: 'chicken-breast', name: 'Chicken breast', category: 'meat',
  per100gRaw: { ...zeroNutrients(), protein: 23 },
  publishedYield: { roasted: 0.71 }, absorbsWater: false,
  source: 'usda', archived: false,
}];

const existing: Batch = {
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar Chow Kit', date: '2026-09-01' },
  createdAt: 0,
};

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-01',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

const props = {
  catalogue, onSaved: vi.fn(), onCancel: vi.fn(), onAddNew: vi.fn(),
  today: new Date(2026, 8, 19),
};

beforeEach(async () => {
  await db.batches.clear();
  vi.clearAllMocks();
});

describe('AddBatchForm creating', () => {
  it('defaults the purchase date to today', () => {
    render(<AddBatchForm {...props} />);
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-09-19');
  });

  it('saves a batch and hands it back', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);

    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '18.50' } });
    fireEvent.change(screen.getByLabelText(/where/i), { target: { value: 'Pasar Chow Kit' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.batches.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.rawWeightG).toBe(1000);
    expect(saved[0]!.purchase.pricePaidMYR).toBe(18.5);
    expect(saved[0]!.purchase.location).toBe('Pasar Chow Kit');
    expect(saved[0]!.purchase.date).toBe('2026-09-19');
  });

  it('requires an ingredient', async () => {
    render(<AddBatchForm {...props} />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ingredient/i);
  });

  it('requires a weight', async () => {
    render(<AddBatchForm {...props} initialIngredientId="chicken-breast" />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/weigh/i);
  });

  it('rejects a negative price', async () => {
    // Note: a non-numeric value cannot be tested here. The price field is
    // <input type="number">, and jsdom blanks the value on assignment, so
    // "free" would arrive as '' and be read as "not recorded".
    render(<AddBatchForm {...props} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/price/i);
  });

  it('accepts a price of zero, because food is sometimes given to you', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('accepts a blank location, because you do not always remember', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} initialIngredientId="chicken-breast" />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await db.batches.toArray())[0]!.purchase.location).toBe('');
  });
});

describe('AddBatchForm editing', () => {
  it('prefills every field from the batch', () => {
    render(<AddBatchForm {...props} batch={existing} sessions={[]} />);
    expect(screen.getByLabelText(/^raw weight/i)).toHaveValue(1000);
    expect(screen.getByLabelText(/price/i)).toHaveValue(20);
    expect(screen.getByLabelText(/where/i)).toHaveValue('Pasar Chow Kit');
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-09-01');
  });

  it('keeps the same id so the sessions stay attached', async () => {
    const onSaved = vi.fn();
    render(<AddBatchForm {...props} onSaved={onSaved} batch={existing} sessions={[]} />);
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.batches.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe('b1');
    expect(saved[0]!.purchase.pricePaidMYR).toBe(21);
  });

  it('blocks shrinking the weight below what has already been cooked', async () => {
    render(<AddBatchForm {...props} batch={existing} sessions={[session({ rawUsedG: g(400) })]} />);
    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('400g');
  });
});
