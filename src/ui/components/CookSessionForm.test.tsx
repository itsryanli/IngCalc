import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CookSessionForm } from './CookSessionForm';
import { db } from '../../storage/db';
import * as kitchenModule from '../../storage/kitchen';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import type { Batch, CookSession, Ingredient } from '../../core/types';

const bundled = (id: string): Ingredient => {
  const found = INGREDIENTS.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no bundled ingredient "${id}"`);
  return found;
};

const batch: Batch = {
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0,
};

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(284), cookedRemainingG: g(284), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

const props = {
  batch,
  ingredient: bundled('chicken-breast'),
  sessions: [] as CookSession[],
  samples: [],
  today: new Date(2026, 8, 19),
  onSaved: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('CookSessionForm', () => {
  it('defaults the raw weight to the whole remainder, so one tap cooks the pack', () => {
    render(<CookSessionForm {...props} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(1000);
  });

  it('defaults to what is left after earlier cooks', () => {
    render(<CookSessionForm {...props} sessions={[session({ rawUsedG: g(400) })]} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(600);
  });

  it('shows whose yield figure the estimate is using', () => {
    render(<CookSessionForm {...props} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/published factor/i);
  });

  it('shows the measured figure once the user has cooks logged', () => {
    const samples = [
      { ingredientId: 'chicken-breast', method: 'roasted' as const, rawUsedG: g(400), cookedWeightG: g(300), excludeFromCalibration: false },
    ];
    render(<CookSessionForm {...props} samples={samples} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/your average across 1 cook/i);
  });

  it('saves a session with the cooked weight as the starting remainder', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '284' } });
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.cookSessions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.batchId).toBe('b1');
    expect(saved[0]!.cookedWeightG).toBe(284);
    expect(saved[0]!.cookedRemainingG).toBe(284);
    expect(saved[0]!.excludeFromCalibration).toBe(false);
  });

  it('blocks cooking more than is left and says how much that is', async () => {
    render(<CookSessionForm {...props} sessions={[session({ rawUsedG: g(800) })]} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '284' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('200g');
  });

  it('warns about an unusual yield without refusing to save it', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    // 0.45 against chicken-breast's published 0.71: 37% off, past the 35% band.
    // 0.50 would NOT flag — it is only 30% off — so do not "simplify" this.
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '180' } });

    expect(screen.getByTestId('outlier-warning')).toHaveTextContent('45%');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('refuses a transposed digit', async () => {
    render(<CookSessionForm {...props} />);
    fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/check both weights/i);
  });

  it('prefills from an existing session when editing', () => {
    render(<CookSessionForm {...props} sessions={[session()]} session={session()} />);
    expect(screen.getByLabelText(/raw weight used/i)).toHaveValue(400);
    expect(screen.getByLabelText(/cooked weight/i)).toHaveValue(284);
    expect(screen.getByLabelText(/portions/i)).toHaveValue(2);
  });

  it('rescales the remainder when an edited cooked weight is corrected', async () => {
    // 80g logged for what was really 800g, half eaten: the correction must
    // leave it half remaining, not 40g out of 800g.
    const wrong = session({ cookedWeightG: g(80), cookedRemainingG: g(40) });
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} sessions={[wrong]} session={wrong} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.cookSessions.toArray())[0]!;
    expect(saved.cookedWeightG).toBe(800);
    expect(saved.cookedRemainingG).toBe(400);
  });

  it('keeps the same id when editing, so calibration does not double-count', async () => {
    const onSaved = vi.fn();
    render(<CookSessionForm {...props} sessions={[session()]} session={session()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.cookSessions.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe('s1');
    expect(saved[0]!.portionCount).toBe(4);
  });

  it('reports a failed write instead of silently doing nothing', async () => {
    const onSaved = vi.fn();
    const spy = vi.spyOn(kitchenModule, 'saveCookSession').mockRejectedValue(new Error('quota'));
    try {
      render(<CookSessionForm {...props} onSaved={onSaved} />);
      fireEvent.change(screen.getByLabelText(/raw weight used/i), { target: { value: '400' } });
      fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '284' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/storage/i);
      expect(onSaved).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
