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
    const row = screen.getByRole('row', { name: /^iron(?! rni shown)/i });
    expect(within(row).getByText('29% RNI')).toBeInTheDocument();
    expect(within(row).getByText('— DV')).toBeInTheDocument();
  });

  it('flags nutrients whose retention was assumed', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={['iron']} />);
    const row = screen.getByRole('row', { name: /^iron(?! rni shown)/i });
    expect(within(row).getByTitle(/assumed 100%/i)).toBeInTheDocument();
  });

  it('renders low-value mg nutrients distinguishably from zero', () => {
    const lowTotals = { ...zeroNutrients(), iron: 0.4 };
    const lowTargets = { iron: { rni: 14 } };
    render(<NutrientTable totals={lowTotals} targets={lowTargets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /^iron(?! rni shown)/i });
    // Amount cell should not display as "0mg" when the actual value is 0.4mg
    expect(within(row).queryByText('0mg')).not.toBeInTheDocument();
  });

  it('does not round a genuinely tiny amount down to zero', () => {
    // (0.004).toLocaleString('en-MY', { maximumFractionDigits: 2 }) returns "0", not "0.00" —
    // trailing zeros are trimmed past the default minimumFractionDigits of 0. 0.4mg (above)
    // never actually probed this: it renders "0.4mg" even without any fix. 0.004mg is the
    // real boundary where the "nonzero never renders as 0" invariant broke.
    const lowTotals = { ...zeroNutrients(), iron: 0.004 };
    const lowTargets = { iron: { rni: 14 } };
    render(<NutrientTable totals={lowTotals} targets={lowTargets} assumedRetentionFor={[]} />);
    const row = screen.getByRole('row', { name: /^iron(?! rni shown)/i });
    expect(within(row).queryByText('0mg')).not.toBeInTheDocument();
    expect(within(row).queryByText('0.00mg')).not.toBeInTheDocument();
    expect(within(row).getByText('<0.01mg')).toBeInTheDocument();
  });

  it('shows a legend explaining the assumed-retention asterisk marker', () => {
    // <abbr title> has no hover on a phone, the actual target device, so the marker's
    // meaning must also be spelled out visibly, not only in a tooltip attribute.
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={['iron']} />);
    expect(screen.getByText(/no sourced figure for this nutrient and cooking method/i)).toBeInTheDocument();
  });

  it('always states which iron bioavailability level is shown', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    expect(screen.getByText(/15% dietary bioavailability \(RNI Malaysia 2017\)/i)).toBeInTheDocument();
  });

  it('explains why RNI is blank for a profile below RNI Malaysia 2017\'s minimum age', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} belowRniAge />);
    expect(screen.getByText(/publishes figures for ages 19 and over/i)).toBeInTheDocument();
  });

  it('omits the below-RNI-age note by default', () => {
    render(<NutrientTable totals={totals} targets={targets} assumedRetentionFor={[]} />);
    expect(screen.queryByText(/publishes figures for ages 19 and over/i)).not.toBeInTheDocument();
  });
});
