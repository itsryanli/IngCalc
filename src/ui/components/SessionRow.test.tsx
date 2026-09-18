import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionRow } from './SessionRow';
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
  batch, ingredient: bundled('chicken-breast'),
  onChanged: vi.fn(), onEdit: vi.fn(),
};

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('SessionRow', () => {
  it('names the method in words rather than camelCase', () => {
    render(<SessionRow {...props} session={session({ method: 'stirFried' })} />);
    expect(screen.getByTestId('session-summary')).toHaveTextContent('Stir-fried');
    expect(screen.getByTestId('session-summary')).not.toHaveTextContent('stirFried');
  });

  it('shows what this cook turned into and what it cost per portion', () => {
    render(<SessionRow {...props} session={session()} />);
    expect(screen.getByTestId('session-summary')).toHaveTextContent('400g');
    expect(screen.getByTestId('session-summary')).toHaveTextContent('284g');
    // RM20 for 1000g, 400g used, 2 portions -> RM4.00.
    expect(screen.getByTestId('session-cost')).toHaveTextContent('RM4.00');
  });

  it('says nothing about an ordinary cook', () => {
    render(<SessionRow {...props} session={session()} />);
    expect(screen.queryByTestId('outlier-flag')).toBeNull();
  });

  it('flags an unusual cook with its reason', () => {
    // 0.45 against chicken-breast's published 0.71: 37% off, past the 35% band.
    render(<SessionRow {...props} session={session({ cookedWeightG: g(180), cookedRemainingG: g(180) })} />);
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('45%');
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('71%');
  });

  it('renders with no throw when the ingredient is unresolvable (archived)', () => {
    render(<SessionRow {...props} ingredient={null} session={session({ cookedWeightG: g(180), cookedRemainingG: g(180) })} />);
    expect(screen.queryByTestId('outlier-flag')).toBeNull();
  });

  it('excludes a bad reading from calibration without deleting the cook', async () => {
    await db.cookSessions.put(session());
    const onChanged = vi.fn();
    render(<SessionRow {...props} session={session()} onChanged={onChanged} />);

    fireEvent.click(screen.getByLabelText(/ignore this cook/i));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    const saved = (await db.cookSessions.toArray())[0]!;
    expect(saved.excludeFromCalibration).toBe(true);
    expect(saved.cookedWeightG).toBe(284);
  });

  it('puts an excluded cook back into calibration on a second tap', async () => {
    await db.cookSessions.put(session({ excludeFromCalibration: true }));
    render(<SessionRow {...props} session={session({ excludeFromCalibration: true })} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/ignore this cook/i));

    await waitFor(async () => {
      expect((await db.cookSessions.toArray())[0]!.excludeFromCalibration).toBe(false);
    });
  });

  it('asks before deleting a cook, naming what is left of it', () => {
    render(<SessionRow {...props} session={session()} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('284g');
  });

  it('deletes the cook on confirmation', async () => {
    await db.cookSessions.put(session());
    const onChanged = vi.fn();
    render(<SessionRow {...props} session={session()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await db.cookSessions.toArray()).toEqual([]);
  });

  it('abandons the delete on a change of mind', async () => {
    await db.cookSessions.put(session());
    render(<SessionRow {...props} session={session()} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect((await db.cookSessions.toArray())).toHaveLength(1);
  });

  it('hands the session up for editing', () => {
    const onEdit = vi.fn();
    render(<SessionRow {...props} session={session()} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  // Controller ruling beyond the brief: both storage writes here (toggleExclude's
  // saveCookSession and remove's deleteCookSession) must be wrapped, matching the
  // precedent in AddIngredientScreen and Tasks 10-12. An unhandled Dexie rejection
  // would otherwise leave the user tapping to nothing, and onChanged must not fire
  // for a write that never happened.
  it('surfaces a save error when the ignore toggle fails, without notifying the parent', async () => {
    const onChanged = vi.fn();
    await db.cookSessions.put(session());
    const spy = vi.spyOn(kitchenModule, 'saveCookSession').mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<SessionRow {...props} session={session()} onChanged={onChanged} />);
      fireEvent.click(screen.getByLabelText(/ignore this cook/i));

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not update/i);
      expect(onChanged).not.toHaveBeenCalled();
      expect((await db.cookSessions.toArray())[0]!.excludeFromCalibration).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('surfaces a save error when delete fails, without notifying the parent', async () => {
    const onChanged = vi.fn();
    await db.cookSessions.put(session());
    const spy = vi.spyOn(kitchenModule, 'deleteCookSession').mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<SessionRow {...props} session={session()} onChanged={onChanged} />);
      fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

      // findByRole would resolve on the confirm prompt's own alert (still present
      // at click time), so wait for the specific failure text instead.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not delete/i));
      expect(onChanged).not.toHaveBeenCalled();
      expect(await db.cookSessions.toArray()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
