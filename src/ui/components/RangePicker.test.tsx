import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RangePicker } from './RangePicker';

describe('RangePicker', () => {
  it('marks the current range and reports a new one', async () => {
    const onChange = vi.fn();
    render(<RangePicker value="thisMonth" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 3 months' }));
    expect(onChange).toHaveBeenCalledWith('last3Months');
  });

  it('is a labelled group', () => {
    render(<RangePicker value="all" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument();
  });
});
