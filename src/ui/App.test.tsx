import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App } from './App';
import { db } from '../storage/db';
import { saveSettings, setActiveProfile } from '../storage/settings';
import { saveProfile } from '../storage/profiles';
import type { Profile } from '../core/types';

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
  // KitchenScreen (mounted by the tests below) reads these tables, so they
  // must be cleared too — otherwise a pass or fail here could depend on
  // whatever some other test file left behind.
  await db.batches.clear();
  await db.cookSessions.clear();
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
    expect(await screen.findByRole('tab', { name: 'Calc' })).toBeEnabled();
  });

  it('prompts for a profile when none exists', async () => {
    render(<App />);
    expect(await screen.findByText(/set up a profile/i)).toBeInTheDocument();
  });

  it('switches to the profile screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));
    // The tab now lands on the list of profiles; the form is one tap further in.
    expect(await screen.findByTestId('profiles-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add a profile/i }));
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

describe('App Kitchen tab', () => {
  it('no longer marks Kitchen as a future phase', async () => {
    render(<App />);
    const tab = await screen.findByRole('tab', { name: /kitchen/i });
    expect(tab).toBeEnabled();
    expect(tab).not.toHaveTextContent(/phase 2/i);
  });

  it('opens the Kitchen screen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: /kitchen/i }));
    expect(await screen.findByRole('heading', { name: /^kitchen$/i })).toBeInTheDocument();
  });

  it('still marks Today and Costs as future phases', async () => {
    render(<App />);
    expect(await screen.findByRole('tab', { name: /today/i })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /costs/i })).toBeDisabled();
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

describe('App active profile', () => {
  const ryan: Profile = {
    id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
    heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
  };
  const mei: Profile = {
    id: 'p2', name: 'Mei', sex: 'female', birthYear: 1998,
    heightCm: 162, weightKg: 55, sessionsPerWeek: 2, goal: 'cut',
  };

  it('shows the chosen profile, not whichever id happens to sort first', async () => {
    await saveProfile(ryan);
    await saveProfile(mei);
    await setActiveProfile('p2');

    render(<App />);

    // The bug: App took profiles[0], which toArray() returns in primary-key
    // order — so "p1" won regardless of what the user had chosen.
    expect(await screen.findByText('Mei')).toBeInTheDocument();
    expect(screen.queryByText('Ryan')).toBeNull();
  });

  it('falls back to a profile when none has been chosen yet', async () => {
    await saveProfile(ryan);

    render(<App />);

    expect(await screen.findByText('Ryan')).toBeInTheDocument();
  });

  it('falls back to another profile when the active one is deleted', async () => {
    await saveProfile(ryan);
    await saveProfile(mei);
    await setActiveProfile('p2');

    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));

    const meiCard = await screen.findByTestId('profile-p2');
    fireEvent.click(within(meiCard).getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    // settings still names the deleted profile; resolveActive is what stops
    // that leaving the app with no active profile at all.
    await waitFor(() => {
      expect(screen.getByTestId('profile-p1')).toHaveAttribute('aria-current', 'true');
    });
  });

  it('asks for a profile again once the last one is deleted', async () => {
    await saveProfile(ryan);

    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));

    const card = await screen.findByTestId('profile-p1');
    fireEvent.click(within(card).getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => { expect(screen.getByTestId('profiles-empty')).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('tab', { name: 'Calc' }));
    expect(await screen.findByText(/set up a profile/i)).toBeInTheDocument();
  });

  it('updates the header when a different profile is chosen', async () => {
    await saveProfile(ryan);
    await saveProfile(mei);
    await setActiveProfile('p1');

    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Profile' }));

    const meiCard = await screen.findByTestId('profile-p2');
    fireEvent.click(within(meiCard).getByRole('button', { name: /use this one/i }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-p2')).toHaveAttribute('aria-current', 'true');
    });
  });
});
