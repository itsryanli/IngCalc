import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayNav } from './DayNav';

const setup = (date = '2026-09-19') => {
  const onChange = vi.fn();
  render(<DayNav date={date} today="2026-09-19" onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
};

describe('DayNav', () => {
  it('names today', () => {
    setup();
    expect(screen.getByTestId('day-name')).toHaveTextContent('Today');
  });

  it('steps back a day', async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole('button', { name: /previous day/i }));
    expect(onChange).toHaveBeenCalledWith('2026-09-18');
  });

  it('steps forward a day', async () => {
    const { onChange, user } = setup('2026-09-17');
    await user.click(screen.getByRole('button', { name: /next day/i }));
    expect(onChange).toHaveBeenCalledWith('2026-09-18');
  });

  it('will not walk into the future', () => {
    setup();
    // A food diary records what was eaten. There is nothing to record tomorrow.
    expect(screen.getByRole('button', { name: /next day/i })).toBeDisabled();
  });

  it('jumps to a typed date', () => {
    // Not user.clear()/user.type(): jsdom's <input type="date"> has no
    // segmented editing model, so it rejects every partial ISO string a
    // character-by-character keystroke simulation would produce along the
    // way (confirmed empirically — onChange never fires at all under
    // user-event here). A real browser's native date picker produces one
    // full value in a single change event, which is what this simulates.
    const { onChange } = setup();
    const field = screen.getByLabelText(/jump to a date/i);
    fireEvent.change(field, { target: { value: '2026-08-01' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-08-01');
  });

  it('will not jump into the future either', () => {
    setup();
    expect(screen.getByLabelText(/jump to a date/i)).toHaveAttribute('max', '2026-09-19');
  });

  it('ignores a future date typed past the max attribute', () => {
    // `max` on <input type="date"> is a validity constraint, not a filter: the
    // change event still fires. Without the handler's own guard the diary
    // moves to tomorrow and accepts a future-dated entry.
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/jump to a date/i), {
      target: { value: '2026-09-20' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a cleared date field', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/jump to a date/i), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still accepts today itself', () => {
    const { onChange } = setup('2026-09-15');
    fireEvent.change(screen.getByLabelText(/jump to a date/i), {
      target: { value: '2026-09-19' },
    });
    expect(onChange).toHaveBeenLastCalledWith('2026-09-19');
  });
});
