import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalcTrace } from './CalcTrace';

const steps = [
  { label: 'Raw', detail: '1000g · 22.5g protein/100g', value: '225.0g protein total', sourceNote: 'FDC 171077' },
  { label: 'Yield (roasted)', detail: '× 0.75', value: '750g cooked', sourceNote: 'published factor' },
];

describe('CalcTrace', () => {
  it('renders every step with its label, detail and value', () => {
    render(<CalcTrace steps={steps} />);
    expect(screen.getByText('Raw')).toBeInTheDocument();
    expect(screen.getByText('× 0.75')).toBeInTheDocument();
    expect(screen.getByText('750g cooked')).toBeInTheDocument();
  });

  it('shows the provenance of each number', () => {
    render(<CalcTrace steps={steps} />);
    expect(screen.getByText('published factor')).toBeInTheDocument();
    expect(screen.getByText('FDC 171077')).toBeInTheDocument();
  });

  it('renders nothing when there are no steps', () => {
    const { container } = render(<CalcTrace steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits sourceNote span when not provided', () => {
    const stepsWithoutNote = [
      { label: 'Raw', detail: '500g', value: '500.0g', sourceNote: undefined },
    ];
    const { container } = render(<CalcTrace steps={stepsWithoutNote} />);
    expect(screen.getByText('500.0g')).toBeInTheDocument();
    // Checks the DOM directly rather than for the literal text "sourceNote" (which the
    // component never renders — it renders the VALUE of s.sourceNote, so the old assertion
    // passed unconditionally, even against an unconditionally-rendered empty source span).
    expect(container.querySelector('.calc-trace__source')).toBeNull();
  });
});
