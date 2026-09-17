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

  it('displays updated text when unit changes', () => {
    const { rerender } = render(<WeightInput value={g(1500)} unit="g" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(1500);
    rerender(<WeightInput value={g(1500)} unit="kg" onChange={vi.fn()} onUnitChange={vi.fn()} label="Weight" />);
    expect(screen.getByLabelText('Weight')).toHaveValue(1.5);
  });

  it('CRITICAL: rejects overflow to Infinity without throwing', () => {
    // This test documents the critical bug: Number("1e400") === Infinity
    // Current validation only checks NaN and negative, missing non-finite check.
    // This should not throw RangeError out of the onChange handler.
    const onChange = vi.fn();
    render(<WeightInput value={g(100)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '1e400' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a number/i);
  });

  it('rejects empty input', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(100)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a number/i);
  });

  it('rejects non-numeric input', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(100)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a number/i);
  });

  it('allows partial input and then completes to valid', () => {
    const onChange = vi.fn();
    render(<WeightInput value={g(500)} unit="g" onChange={onChange} onUnitChange={vi.fn()} label="Weight" />);
    const input = screen.getByLabelText('Weight') as HTMLInputElement;

    // Type a decimal number character by character
    // First just the digit '5'
    fireEvent.change(input, { target: { value: '5' } });
    expect(input.value).toBe('5');
    expect(onChange).toHaveBeenLastCalledWith(5);

    // Then add a decimal point and digit: '5.2'
    fireEvent.change(input, { target: { value: '5.2' } });
    expect(input.value).toBe('5.2');
    expect(onChange).toHaveBeenLastCalledWith(5.2);

    // Complete the entry with another digit: '52'
    fireEvent.change(input, { target: { value: '52' } });
    expect(input.value).toBe('52');
    expect(onChange).toHaveBeenLastCalledWith(52);
  });
});
