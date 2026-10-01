import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('says a new version is ready and reloads only when asked', () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateBanner onReload={onReload} onDismiss={onDismiss} />);
    expect(screen.getByRole('status')).toHaveTextContent(/new version of ingcalc is ready/i);
    expect(onReload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('can be put off until later', () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdateBanner onReload={onReload} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onReload).not.toHaveBeenCalled();
  });
});
