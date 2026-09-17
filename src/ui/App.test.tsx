import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';
import { db } from '../storage/db';
import { saveSettings } from '../storage/settings';

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows all four tabs', async () => {
    render(<App />);
    for (const name of ['Today', 'Kitchen', 'Calc', 'Costs']) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('disables the tabs that arrive in later phases', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Today' })).toBeDisabled();
    expect(await screen.findByRole('tab', { name: 'Kitchen' })).toBeDisabled();
    expect(await screen.findByRole('tab', { name: 'Calc' })).toBeEnabled();
  });

  it('prompts for a profile when none exists', async () => {
    render(<App />);
    expect(await screen.findByText(/set up a profile/i)).toBeInTheDocument();
  });

  it('switches to the profile screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));
    expect(await screen.findByLabelText(/birth year/i)).toBeInTheDocument();
  });

  it('opens on the tab stored in settings', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'calc', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Calc' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Calc when the stored landing tab is not built yet', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'today', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Calc' })).toHaveAttribute('aria-selected', 'true');
  });
});

// `isStorageAvailable` is a named ES-module export, so it must be replaced with
// vi.mock at module level rather than vi.spyOn, which cannot rebind it.
describe('App without storage', () => {
  it('warns when storage is unavailable rather than failing silently', async () => {
    vi.doMock('../storage/db', async () => {
      const actual = await vi.importActual<typeof import('../storage/db')>('../storage/db');
      return { ...actual, isStorageAvailable: async () => false };
    });
    const { App: AppNoStorage } = await import('./App');
    render(<AppNoStorage />);
    try {
      expect(await screen.findByRole('alert')).toHaveTextContent(/private browsing|storage/i);
    } finally {
      vi.doUnmock('../storage/db');
    }
  });
});
