import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EatControl } from './EatControl';
import { db } from '../../storage/db';
import * as kitchenModule from '../../storage/kitchen';
import { g } from '../../core/units';
import type { CookSession } from '../../core/types';

const session = (over: Partial<CookSession> = {}): CookSession => ({
  id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(400),
  cookedWeightG: g(296), cookedRemainingG: g(296), cookedAt: '2026-09-19',
  portionCount: 2, excludeFromCalibration: false, ...over,
});

beforeEach(async () => {
  await db.cookSessions.clear();
  vi.clearAllMocks();
});

describe('EatControl', () => {
  it('shows what is left in both grams and portions', () => {
    render(<EatControl session={session({ cookedRemainingG: g(148) })} onEaten={vi.fn()} />);
    expect(screen.getByTestId('remaining')).toHaveTextContent('148g');
    expect(screen.getByTestId('remaining')).toHaveTextContent('1.0');
  });

  it('eating one portion subtracts that portion weight', async () => {
    const onEaten = vi.fn();
    await db.cookSessions.put(session());
    render(<EatControl session={session()} onEaten={onEaten} />);

    fireEvent.click(screen.getByRole('button', { name: /eat 1 portion/i }));

    await waitFor(() => expect(onEaten).toHaveBeenCalled());
    expect((await db.cookSessions.toArray())[0]!.cookedRemainingG).toBe(148);
  });

  it('eating a weighed amount subtracts exactly that', async () => {
    const onEaten = vi.fn();
    await db.cookSessions.put(session());
    render(<EatControl session={session()} onEaten={onEaten} />);

    fireEvent.change(screen.getByLabelText(/weighed amount/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^eat this much/i }));

    await waitFor(() => expect(onEaten).toHaveBeenCalled());
    expect((await db.cookSessions.toArray())[0]!.cookedRemainingG).toBe(196);
  });

  it('blocks eating more than is left, reporting grams and portions', async () => {
    render(<EatControl session={session({ cookedRemainingG: g(148) })} onEaten={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/weighed amount/i), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /^eat this much/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('148g');
    expect(screen.getByRole('alert')).toHaveTextContent('1.0');
  });

  it('blocks eating a portion when less than a portion is left', async () => {
    render(<EatControl session={session({ cookedRemainingG: g(50) })} onEaten={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /eat 1 portion/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('50g');
  });

  it('offers nothing to eat once the session is finished', () => {
    render(<EatControl session={session({ cookedRemainingG: g(0) })} onEaten={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /eat 1 portion/i })).toBeNull();
    expect(screen.getByTestId('remaining')).toHaveTextContent(/all eaten/i);
  });

  it('surfaces a save error and does not clear the input', async () => {
    const onEaten = vi.fn();
    await db.cookSessions.put(session());
    const spy = vi.spyOn(kitchenModule, 'saveCookSession').mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<EatControl session={session()} onEaten={onEaten} />);

      fireEvent.change(screen.getByLabelText(/weighed amount/i), { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: /^eat this much/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not record that/i);
      expect(onEaten).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/weighed amount/i)).toHaveValue(100);
    } finally {
      spy.mockRestore();
    }
  });
});
