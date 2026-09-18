import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YieldBadge } from './YieldBadge';

describe('YieldBadge', () => {
  it('names the user own cooks and the published figure they replaced', () => {
    render(<YieldBadge resolved={{ factor: 0.72, source: 'measured', sampleCount: 4 }} published={0.75} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('Your average across 4 cooks: 0.72');
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('published: 0.75');
  });

  it('says one cook rather than 1 cooks', () => {
    render(<YieldBadge resolved={{ factor: 0.7, source: 'measured', sampleCount: 1 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('1 cook:');
  });

  it('labels a published factor as published', () => {
    render(<YieldBadge resolved={{ factor: 0.75, source: 'published', sampleCount: 0 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent('Published factor: 0.75');
  });

  it('calls a category fallback a rough estimate, as the spec requires', () => {
    render(<YieldBadge resolved={{ factor: 0.85, source: 'categoryDefault', sampleCount: 0 }} />);
    expect(screen.getByTestId('yield-badge')).toHaveTextContent(/rough estimate/i);
  });
});
