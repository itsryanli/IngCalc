import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MethodCompare } from './MethodCompare';
import type { MethodRow } from '../../core/methodCompare';

const rows: MethodRow[] = [
  {
    method: 'steamed',
    yieldFactor: 0.92,
    yieldSource: 'published',
    weightKeptPct: 92,
    retainedPct: { potassium: 92 },
    assumedRetentionFor: [],
    score: 92,
  },
  {
    method: 'boiled',
    yieldFactor: 0.74,
    yieldSource: 'categoryDefault',
    weightKeptPct: 74,
    retainedPct: { potassium: 72 },
    assumedRetentionFor: ['potassium'],
    score: 72,
  },
];

describe('MethodCompare', () => {
  it('renders a row per method with weight kept and yield source', () => {
    render(<MethodCompare rows={rows} highlight={['potassium']} />);
    expect(screen.getByRole('table', { name: /method comparison/i })).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('rough estimate')).toBeInTheDocument();
  });

  it('marks assumed-retention cells with the asterisk abbr', () => {
    render(<MethodCompare rows={rows} highlight={['potassium']} />);
    expect(screen.getByTitle(/assumed 100%/i)).toBeInTheDocument();
  });

  it('shows a legend explaining the asterisk marker', () => {
    // <abbr title> has no hover on a phone, the actual target device, so the marker's
    // meaning must also be spelled out visibly, not only in a tooltip attribute.
    render(<MethodCompare rows={rows} highlight={['potassium']} />);
    expect(screen.getByText(/no sourced figure for this nutrient and cooking method/i)).toBeInTheDocument();
  });
});
