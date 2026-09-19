import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KitchenScreen } from './KitchenScreen';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import type { Batch, CookSession } from '../../core/types';

const batch = (id: string, over: Partial<Batch> = {}): Batch => ({
  id, ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
  createdAt: 0, ...over,
});

const session = (id: string, batchId: string, over: Partial<CookSession> = {}): CookSession => ({
  id, batchId, method: 'roasted', rawUsedG: g(1000), cookedWeightG: g(710),
  cookedRemainingG: g(710), cookedAt: '2026-09-19', portionCount: 4,
  excludeFromCalibration: false, ...over,
});

// The ingredient control is a typeahead combobox, not a <select>: options activate on
// mousedown (the input's blur would otherwise close the list before a click landed).
const press = (el: HTMLElement) => fireEvent.mouseDown(el);

beforeEach(async () => {
  await db.batches.clear();
  await db.cookSessions.clear();
});

describe('KitchenScreen', () => {
  it('invites a first purchase when the kitchen is empty', async () => {
    render(<KitchenScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument();
    });
  });

  it('groups batches by their derived state', async () => {
    await db.batches.bulkPut([batch('b1'), batch('b2'), batch('b3'), batch('b4')]);
    // b2 fully cooked with food left; b3 fully cooked and fully eaten;
    // b4 only partly used, so raw weight remains alongside the cook.
    await db.cookSessions.bulkPut([
      session('s2', 'b2'),
      session('s3', 'b3', { cookedRemainingG: g(0) }),
      session('s4', 'b4', { rawUsedG: g(400), cookedWeightG: g(284), cookedRemainingG: g(284) }),
    ]);

    render(<KitchenScreen />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^raw$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /^cooked$/i })).toBeInTheDocument();
    // Grouping is this screen's core job: a bug routing a part-cooked batch into
    // "raw" or "cooked" instead of its own group would otherwise pass unnoticed.
    expect(screen.getByRole('heading', { name: /^part cooked$/i })).toBeInTheDocument();
    // Finished batches are hidden behind a toggle: a kitchen accumulates them
    // forever, and this is a phone screen.
    expect(screen.queryByRole('heading', { name: /^finished$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /finished \(1\)/i })).toBeInTheDocument();
  });

  it('reveals finished batches on request', async () => {
    await db.batches.put(batch('b3'));
    await db.cookSessions.put(session('s3', 'b3', { cookedRemainingG: g(0) }));

    render(<KitchenScreen />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /finished \(1\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /finished \(1\)/i }));
    expect(screen.getByRole('heading', { name: /^finished$/i })).toBeInTheDocument();
  });

  it('opens the purchase form and shows the new batch afterwards', async () => {
    render(<KitchenScreen today={new Date(2026, 8, 19)} />);
    await waitFor(() => { expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /log a purchase/i }));
    expect(screen.getByLabelText(/^raw weight/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^raw weight/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // No ingredient was chosen, so it must complain rather than save.
    expect(await screen.findByRole('alert')).toHaveTextContent(/ingredient/i);
  });

  it('returns to the list when the purchase form is cancelled', async () => {
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /log a purchase/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument();
  });

  it('opens the cook form from a raw batch', async () => {
    await db.batches.put(batch('b1'));
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('batch-state')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /cook some/i }));
    expect(screen.getByLabelText(/raw weight used/i)).toBeInTheDocument();
  });

  it('shows a cook on the batch after saving it', async () => {
    await db.batches.put(batch('b1'));
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('batch-state')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /cook some/i }));
    fireEvent.change(screen.getByLabelText(/cooked weight/i), { target: { value: '710' } });
    fireEvent.change(screen.getByLabelText(/portions/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByTestId('session-summary')).toHaveTextContent('710g');
    });
    expect(screen.getByTestId('batch-state')).toHaveTextContent('Cooked');
  });

  // Pins the correction to the brief: AddIngredientScreen's onSaved hands back the new
  // ingredient's id, and it must survive the round trip into the purchase form's picker
  // rather than being discarded. Without the fix, the user would have to hunt for the
  // ingredient they just typed a second time.
  it('preselects a newly added ingredient after returning from the add-ingredient flow', async () => {
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('kitchen-empty')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /log a purchase/i }));

    const picker = await screen.findByRole('combobox', { name: /ingredient/i });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Petai' } });
    press(await screen.findByRole('option', { name: /Add "Petai"/i }));

    expect(await screen.findByLabelText(/^name/i)).toHaveValue('Petai');
    fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

    // Back on the purchase form, its picker now shows the new ingredient, selected.
    const returnedPicker = await screen.findByRole('combobox', { name: /ingredient/i }) as HTMLInputElement;
    await waitFor(() => expect(returnedPicker.value).toBe('Petai'));
  });

  // Same fix, but from the edit path: the batch already has an ingredient
  // (chicken-breast), and adding a brand-new one from its picker must override
  // that original selection rather than be silently dropped behind it.
  it('preselects a newly added ingredient after returning from editing a batch', async () => {
    await db.batches.put(batch('b1'));
    render(<KitchenScreen />);
    await waitFor(() => { expect(screen.getByTestId('batch-state')).toBeInTheDocument(); });

    fireEvent.click(screen.getByRole('button', { name: /edit purchase/i }));

    const picker = await screen.findByRole('combobox', { name: /ingredient/i });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Petai' } });
    press(await screen.findByRole('option', { name: /Add "Petai"/i }));

    expect(await screen.findByLabelText(/^name/i)).toHaveValue('Petai');
    fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

    const returnedPicker = await screen.findByRole('combobox', { name: /ingredient/i }) as HTMLInputElement;
    await waitFor(() => expect(returnedPicker.value).toBe('Petai'));
  });
});
