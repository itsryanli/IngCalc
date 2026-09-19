import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

const Boom = ({ go }: { go: boolean }) => {
  if (go) throw new Error('bad row');
  return <p>fine</p>;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(<ErrorBoundary resetKey="log" onReset={() => {}}><Boom go={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows a way out instead of a blank screen when a child throws', () => {
    // React logs the caught error; silence it so the run stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary resetKey="log" onReset={() => {}}><Boom go /></ErrorBoundary>);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to the log/i })).toBeInTheDocument();
  });

  it('calls onReset when the way out is taken', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(<ErrorBoundary resetKey="log" onReset={onReset}><Boom go /></ErrorBoundary>);

    await userEvent.click(screen.getByRole('button', { name: /back to the log/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it('recovers when the resetKey changes, so a different tab is not still broken', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="kitchen" onReset={() => {}}><Boom go /></ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<ErrorBoundary resetKey="calc" onReset={() => {}}><Boom go={false} /></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
