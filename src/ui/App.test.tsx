import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { db } from '../storage/db';
import { saveSettings, setActiveProfile } from '../storage/settings';
import { saveProfile } from '../storage/profiles';
import { g, myr } from '../core/units';
import type { Batch, Profile } from '../core/types';

beforeEach(async () => {
  // Every screen the tests below mount reads its own tables, so they must all
  // be cleared — otherwise a pass or fail here could depend on whatever some
  // other test file left behind.
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows all four tabs', async () => {
    render(<App />);
    for (const name of ['Log', 'Kitchen', 'Calc', 'Costs']) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('enables every tab now that Costs has arrived', async () => {
    render(<App />);
    for (const name of ['Log', 'Kitchen', 'Calc', 'Costs', 'Profile']) {
      expect(await screen.findByRole('tab', { name })).toBeEnabled();
    }
  });

  it('opens the Costs screen', async () => {
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Costs' }));
    expect(await screen.findByRole('heading', { name: 'Costs' })).toBeInTheDocument();
  });

  it('shows the restored profile in the header after a replace', async () => {
    const fixture = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Costs' }));
    await user.upload(
      await screen.findByLabelText(/restore from backup/i),
      new File([fixture], 'backup.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await user.click(await screen.findByRole('button', { name: 'Erase and restore' }));
    expect(await screen.findByText('Ali', { selector: '.app__profile' })).toBeInTheDocument();
  });

  it('lands on the Log', async () => {
    await saveSettings({ id: 'singleton', activeProfileId: null, landingTab: 'log', defaultWeightUnit: 'g' });
    render(<App />);
    expect(await screen.findByRole('tab', { name: /log/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('renames the Today tab to Log', async () => {
    render(<App />);
    expect(screen.queryByRole('tab', { name: /today/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /log/i })).toBeEnabled();
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
    // The tab button exists from the very first render (the initial state is
    // 'log'), so `findByRole` alone would resolve before the async settings
    // load has a chance to flip it — the assertion has to wait for that too.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Calc' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('falls back to the Log when the stored tab is one that does not exist', async () => {
    await saveSettings({
      id: 'singleton', activeProfileId: null,
      landingTab: 'unknown' as never, defaultWeightUnit: 'g',
    });
    render(<App />);
    expect(await screen.findByRole('tab', { name: /log/i })).toHaveAttribute('aria-selected', 'true');
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

// `batchState` is called unconditionally while grouping batches for display, so
// mocking it to throw is a clean, honest way to make Kitchen fail mid-render
// without reaching into React internals or corrupting stored data.
describe('App error boundary', () => {
  const brokenBatch: Batch = {
    id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
    purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
    createdAt: 0,
  };

  it('keeps the rest of the app usable when a screen throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.batches.put(brokenBatch);
    vi.doMock('../core/batch', async () => {
      const actual = await vi.importActual<typeof import('../core/batch')>('../core/batch');
      return {
        ...actual,
        batchState: () => { throw new Error('bad batch row'); },
      };
    });

    try {
      const { App: AppWithBrokenKitchen } = await import('./App');
      render(<AppWithBrokenKitchen />);

      await userEvent.click(await screen.findByRole('tab', { name: /kitchen/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not be shown/i);

      await userEvent.click(screen.getByRole('tab', { name: /calc/i }));
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      vi.doUnmock('../core/batch');
    }
  });
});
