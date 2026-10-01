import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ShoppingTripForm } from './ShoppingTripForm';
import { db } from '../../storage/db';
import { zeroNutrients } from '../../core/nutrients';
import type { Ingredient } from '../../core/types';

const ingredient = (id: string, name: string): Ingredient => ({
  id, name, category: 'meat', per100gRaw: { ...zeroNutrients(), protein: 20 },
  publishedYield: {}, absorbsWater: false, source: 'usda', archived: false,
});
const catalogue = [ingredient('chicken-breast', 'Chicken breast'), ingredient('beef', 'Beef')];

const props = {
  catalogue, pastLocations: ['Pasar Chow Kit'], today: new Date(2026, 8, 30),
  onSaved: vi.fn(), onCancel: vi.fn(), onCatalogueChanged: vi.fn(),
};

/** Options activate on mousedown; see KitchenScreen.test. */
function pick(item: HTMLElement, name: string) {
  const picker = within(item).getByRole('combobox', { name: /ingredient/i });
  fireEvent.focus(picker);
  fireEvent.change(picker, { target: { value: name } });
  fireEvent.mouseDown(within(item).getByRole('option', { name }));
}

function fill(n: number, name: string, grams: string, price: string) {
  const item = screen.getByTestId(`trip-item-${n}`);
  pick(item, name);
  fireEvent.change(within(item).getByLabelText(/^raw weight/i), { target: { value: grams } });
  fireEvent.change(within(item).getByLabelText(/price/i), { target: { value: price } });
}

beforeEach(async () => { await db.batches.clear(); props.onSaved.mockClear(); });

describe('ShoppingTripForm', () => {
  it('saves every item of a trip with the shared shop, date and trip', async () => {
    render(<ShoppingTripForm {...props} />);
    fireEvent.change(screen.getByLabelText(/where from/i), { target: { value: 'Pasar Chow Kit' } });
    fill(1, 'Chicken breast', '1000', '18.50');
    fireEvent.click(screen.getByRole('button', { name: /add another item/i }));
    fill(2, 'Beef', '500', '25');

    expect(screen.getByTestId('trip-total')).toHaveTextContent('2 items');
    expect(screen.getByTestId('trip-total')).toHaveTextContent('43.50');

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());

    const saved = (await db.batches.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(saved.map((b) => b.ingredientId)).toEqual(['chicken-breast', 'beef']);
    expect(saved.map((b) => b.purchase.pricePaidMYR)).toEqual([18.5, 25]);
    expect(new Set(saved.map((b) => b.purchase.location))).toEqual(new Set(['Pasar Chow Kit']));
    expect(new Set(saved.map((b) => b.purchase.date))).toEqual(new Set(['2026-09-30']));
    expect(saved[0]!.purchase.tripId).toBeTruthy();
    expect(saved[0]!.purchase.tripId).toBe(saved[1]!.purchase.tripId);
  });

  it('names the item that is incomplete and saves nothing', async () => {
    render(<ShoppingTripForm {...props} />);
    fill(1, 'Chicken breast', '1000', '18.50');
    fireEvent.click(screen.getByRole('button', { name: /add another item/i }));

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/item 2: pick an ingredient/i);
    expect(await db.batches.count()).toBe(0);
  });

  it('drops a removed item from the trip', async () => {
    render(<ShoppingTripForm {...props} />);
    fill(1, 'Chicken breast', '1000', '18.50');
    fireEvent.click(screen.getByRole('button', { name: /add another item/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove item 2/i }));

    expect(screen.queryByTestId('trip-item-2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled());
    expect(await db.batches.count()).toBe(1);
  });

  it('offers shops already used', () => {
    const { container } = render(<ShoppingTripForm {...props} />);
    expect(container.querySelector('datalist option')).toHaveAttribute('value', 'Pasar Chow Kit');
  });
});
