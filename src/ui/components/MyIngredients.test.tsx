import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyIngredients } from './MyIngredients';
import { db } from '../../storage/db';
import { zeroNutrients } from '../../core/nutrients';
import type { Ingredient } from '../../core/types';

const mine = (id: string, name: string, archived = false): Ingredient => ({
  id, name, category: 'other', per100gRaw: zeroNutrients(), publishedYield: {},
  absorbsWater: false, source: 'user', archived,
});

beforeEach(async () => { await db.userIngredients.clear(); });

describe('MyIngredients', () => {
  it('shows nothing when the person has added no ingredients', () => {
    const { container } = render(<MyIngredients ingredients={[]} onEdit={vi.fn()} onChanged={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers each active ingredient for editing', () => {
    const onEdit = vi.fn();
    const crackers = mine('c', 'Oat crackers');
    render(<MyIngredients ingredients={[crackers]} onEdit={onEdit} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Oat crackers' }));
    expect(onEdit).toHaveBeenCalledWith(crackers);
  });

  it('archives an ingredient without asking, since it can be restored', async () => {
    const onChanged = vi.fn();
    await db.userIngredients.put(mine('c', 'Oat crackers'));
    render(<MyIngredients ingredients={[mine('c', 'Oat crackers')]} onEdit={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Oat crackers' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await db.userIngredients.get('c'))!.archived).toBe(true);
  });

  it('keeps archived ingredients folded away, and can restore one', async () => {
    const onChanged = vi.fn();
    await db.userIngredients.put(mine('t', 'Tempe chips', true));
    render(<MyIngredients ingredients={[mine('c', 'Oat crackers'), mine('t', 'Tempe chips', true)]}
                          onEdit={vi.fn()} onChanged={onChanged} />);
    expect(screen.queryByText('Tempe chips')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show archived (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Tempe chips' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((await db.userIngredients.get('t'))!.archived).toBe(false);
  });
});
