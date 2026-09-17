import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NutrientTable } from './NutrientTable';
import { zeroNutrients } from '../../core/nutrients';

const totals = { ...zeroNutrients(), protein: 44, potassium: 2560, iron: 4.1 };
const targets = {
  protein: { rni: 62, dv: 50 },
  potassium: { rni: 4700, dv: 3500 },
  iron: { rni: 14 },
};

describe('NutrientTable', () => {
  it('shows both RNI and DV percentages', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /potassium/i });
    expect(within(row).getByText('2,560mg')).toBeInTheDocument();
    expect(within(row).getByText('54% RNI')).toBeInTheDocument();
    expect(within(row).getByText('73% DV')).toBeInTheDocument();
  });

  it('shows a dash where a standard has no figure rather than reusing the other', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /iron/i });
    expect(within(row).getByText('29% RNI')).toBeInTheDocument();
    expect(within(row).getByText('— DV')).toBeInTheDocument();
  });

  it('flags nutrients whose retention was assumed', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={['iron']} />);
    const row = screen.getByRole('row', { name: /iron/i });
    expect(within(row).getByTitle(/assumed 100%/i)).toBeInTheDocument();
  });

  it('renders low-value mg nutrients distinguishably from zero', () => {
    const lowTotals = { ...zeroNutrients(), iron: 0.4 };
    const lowTargets = { iron: { rni: 14 } };
    render(<NutrientTable totals={lowTotals} targets={lowTargets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /iron/i });
    // Amount cell should not display as "0mg" when the actual value is 0.4mg
    expect(within(row).queryByText('0mg')).not.toBeInTheDocument();
  });
});
