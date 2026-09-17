import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeightInput } from './WeightInput';
import { g } from '../../core/units';

describe('WeightInput', () => {
  it('shows grams unchanged', () => {
    render(<WeightInput value={g(750)} unit="g" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(750);
  });

  it('displays the gram value in kilograms when the unit is kg', () => {
    render(<WeightInput value={g(1500)} unit="kg" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(1.5);
  });

  it('emits grams when the user types kilograms', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(0)} unit="kg" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '1.2' } });
    expect(onChange).toHaveBeenCalledWith(1200);
  });

  it('ignores a negative entry rather than throwing', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(100)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '-5' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be negative/i);
  });

  it('switches units without changing the underlying weight', () => {
    const onUnitChange = vi.fn();
    render(<WeightInput value={g(1500)} unit="g" onChange={vi.fn()} onUnitChange={onUnitChange} label="Weight" />);
    fireEvent.click(screen.getByRole('button', { name: 'kg' }));
    expect(onUnitChange).toHaveBeenCalledWith('kg');
  });
});
