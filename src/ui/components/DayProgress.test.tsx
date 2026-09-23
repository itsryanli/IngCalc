import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayProgress } from './DayProgress';
import { zeroNutrients } from '../../core/nutrients';

const targets = { kcal: 2000, proteinG: 150, micros: {} };
const totals = { ...zeroNutrients(), kcal: 1000, protein: 75 };

describe('DayProgress', () => {
  it('shows what has been eaten against the target', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact />);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('1,000');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('2,000');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('50%');
  });

  it('marks protein as a floor when a quick entry left it out', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact={false} />);
    expect(screen.getByTestId('protein-progress')).toHaveTextContent('at least');
  });

  it('does not mark protein when every entry carried one', () => {
    render(<DayProgress totals={totals} targets={targets} proteinExact />);
    expect(screen.getByTestId('protein-progress')).not.toHaveTextContent('at least');
  });

  it('reports a bar past the target without clipping the number', () => {
    render(<DayProgress totals={{ ...totals, kcal: 3000 }} targets={targets} proteinExact />);
    // The figure is honest; only the bar is capped.
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('150%');
    expect(screen.getByTestId('kcal-bar')).toHaveStyle({ width: '100%' });
  });

  it('says so rather than dividing by zero when there is no target', () => {
    render(<DayProgress totals={totals} targets={{ kcal: 0, proteinG: 0, micros: {} }} proteinExact />);
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('no target');
  });
});
