import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddIngredientScreen } from './AddIngredientScreen';
import { db } from '../../storage/db';
import * as userIngredientsModule from '../../storage/userIngredients';

beforeEach(async () => { await db.userIngredients.clear(); });

describe('AddIngredientScreen', () => {
  it('prefills the name from the failed search', () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/name/i)).toHaveValue('Petai');
  });

  it('saves a user ingredient marked as user-sourced', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^energy/i), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.userIngredients.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.source).toBe('user');
    expect(saved[0]!.per100gRaw.protein).toBe(6);
    expect(saved[0]!.archived).toBe(false);
  });

  it('requires a name', async () => {
    render(<AddIngredientScreen initialName="" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
  });

  it('rejects a negative nutrient value', async () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/negative/i);
  });

  it('defaults unfilled nutrients to zero rather than leaving them undefined', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.per100gRaw.magnesium).toBe(0);
  });

  it('rejects non-numeric nutrient input and does not save', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be a number/i);
    expect(onSaved).not.toHaveBeenCalled();
    const saved = await db.userIngredients.toArray();
    expect(saved).toHaveLength(0);
  });

  it('rejects whitespace-only name like empty name', async () => {
    render(<AddIngredientScreen initialName="   " onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
  });

  it('has no Cancel button when no onCancel is given', () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('calls onCancel and does not save when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.userIngredients.toArray()).toHaveLength(0);
  });

  it('treats whitespace-only nutrient field as unfilled default', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.per100gRaw.protein).toBe(0);
  });

  it('shows a plain-language error and does not call onSaved when saving fails', async () => {
    // Dexie can reject (private browsing, quota, a blocked upgrade). Without a try/catch
    // around the save, that rejection is unhandled, onSaved never fires, and the user taps
    // Save to absolutely nothing: no error, no navigation, form unchanged.
    const onSaved = vi.fn();
    const spy = vi
      .spyOn(userIngredientsModule, 'saveUserIngredient')
      .mockRejectedValue(new Error('storage unavailable'));
    try {
      render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
      expect(onSaved).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
