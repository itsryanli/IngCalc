import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionRow } from './SessionRow';
import { db } from '../../storage/db';
import * as kitchenModule from '../../storage/kitchen';
import { g, myr } from '../../core/units';
import { INGREDIENTS } from '../../data/ingredients';
import type { Batch, CookSession, Ingredient, MealEntry } from '../../core/types';

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
  cookedWeightG: g(284), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

/** A weighed entry against `s1`: how a partly eaten cook is set up now. */
const eaten = (grams: number, over: Partial<MealEntry> = {}): MealEntry => ({
  id: 'm1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1,
  kind: 'weight', cookSessionId: 's1', grams: g(grams), ...over,
} as MealEntry);

const props = {
  batch, ingredient: bundled('chicken-breast'), entries: [] as readonly MealEntry[],
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
    render(<SessionRow {...props} session={session({ cookedWeightG: g(180) })} />);
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('45%');
    expect(screen.getByTestId('outlier-flag')).toHaveTextContent('71%');
  });

  it('renders with no throw when the ingredient is unresolvable (archived)', () => {
    render(<SessionRow {...props} ingredient={null} session={session({ cookedWeightG: g(180) })} />);
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

  // The remaining line moved here from EatControl, which is gone: consumption is
  // logged in Log now, and Kitchen only reports what the entries leave.
  it('shows what is left in both grams and portions, derived from the entries', () => {
    // 284g in 2 portions of 142g; a weighed 136g eaten leaves 148g, about 1.0 portions.
    render(<SessionRow {...props} entries={[eaten(136)]} session={session()} />);
    expect(screen.getByTestId('remaining')).toHaveTextContent('148g');
    expect(screen.getByTestId('remaining')).toHaveTextContent('1.0');
  });

  it('says a cook is all eaten once the entries account for the whole of it', () => {
    render(<SessionRow {...props} entries={[eaten(284)]} session={session()} />);
    expect(screen.getByTestId('remaining')).toHaveTextContent(/all eaten/i);
  });

  it('asks before deleting a cook, naming what is left of it', () => {
    render(<SessionRow {...props} session={session()} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    // A confirmation question paired with its own buttons, not an assertive
    // announcement — found by its text, leaving role="alert" free for write errors.
    expect(screen.getByText(/delete this cook/i)).toHaveTextContent('284g');
  });

  it('names the derived remainder, not the cooked weight, when confirming a delete', () => {
    render(<SessionRow {...props} entries={[eaten(136)]} session={session()} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
    expect(screen.getByText(/delete this cook/i)).toHaveTextContent('148g');
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

      // The confirm prompt is no longer role="alert", so findByRole unambiguously
      // means a write error.
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

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
      expect(onChanged).not.toHaveBeenCalled();
      expect(await db.cookSessions.toArray()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  // Finding 1 from review: the exclude checkbox is reachable while the delete
  // confirmation is open, and a failed write there must still be visible — the
  // old `!confirming` render guard hid it.
  it('surfaces a save error from the ignore toggle even while the delete confirmation is open', async () => {
    const onChanged = vi.fn();
    await db.cookSessions.put(session());
    const spy = vi.spyOn(kitchenModule, 'saveCookSession').mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<SessionRow {...props} session={session()} onChanged={onChanged} />);
      fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
      fireEvent.click(screen.getByLabelText(/ignore this cook/i));

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not update/i);
      expect(onChanged).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // Finding 2 from review: neither confirm-dialog transition cleared a stale
  // error, so re-opening the dialog after a failed delete and backing out of it
  // resurrected a message about a failure that wasn't just attempted.
  it('clears a stale delete error on a change of mind, on reopening the dialog', async () => {
    await db.cookSessions.put(session());
    const spy = vi.spyOn(kitchenModule, 'deleteCookSession').mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<SessionRow {...props} session={session()} />);
      fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);

      fireEvent.click(screen.getByRole('button', { name: /^delete/i }));
      fireEvent.click(screen.getByRole('button', { name: /keep it/i }));

      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
