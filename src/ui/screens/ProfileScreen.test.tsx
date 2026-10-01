import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ProfileScreen } from './ProfileScreen';
import { db } from '../../storage/db';
import * as profilesModule from '../../storage/profiles';
import type { Profile } from '../../core/types';

// Fixed so age 30 (and therefore TDEE 2,633 / protein 135g) never drifts with the calendar.
const FIXED_TODAY = new Date('2026-06-15T00:00:00Z');

const ryan: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

const mei: Profile = {
  id: 'p2', name: 'Mei', sex: 'female', birthYear: 1998,
  heightCm: 162, weightKg: 55, sessionsPerWeek: 2, goal: 'cut',
};

beforeEach(async () => { await db.profiles.clear(); });

const renderScreen = (over: Partial<Parameters<typeof ProfileScreen>[0]> = {}) => {
  const props = {
    profiles: [ryan, mei],
    activeId: 'p1',
    storageError: null,
    onSetActive: vi.fn(),
    onChanged: vi.fn(),
    today: FIXED_TODAY,
    ...over,
  };
  render(<ProfileScreen {...props} />);
  return props;
};

const row = (id: string) => within(screen.getByTestId(`profile-${id}`));

describe('ProfileScreen list', () => {
  it('lists every profile with the targets it produces', () => {
    renderScreen();

    expect(row('p1').getByText(/Ryan/)).toBeInTheDocument();
    expect(row('p1').getByTestId('profile-targets')).toHaveTextContent('2,633 kcal');
    expect(row('p1').getByTestId('profile-targets')).toHaveTextContent('135g protein');
    expect(row('p2').getByText(/Mei/)).toBeInTheDocument();
  });

  it('marks which profile is active', () => {
    renderScreen();

    expect(screen.getByTestId('profile-p1')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('profile-p2')).not.toHaveAttribute('aria-current', 'true');
  });

  it('offers to switch only to profiles that are not already active', () => {
    renderScreen();

    expect(row('p1').queryByRole('button', { name: /use this one/i })).toBeNull();
    expect(row('p2').getByRole('button', { name: /use this one/i })).toBeInTheDocument();
  });

  it('switches to another profile', () => {
    const props = renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /use this one/i }));

    expect(props.onSetActive).toHaveBeenCalledWith('p2');
  });

  it('says so when there are no profiles yet', () => {
    renderScreen({ profiles: [], activeId: null });

    expect(screen.getByTestId('profiles-empty')).toBeInTheDocument();
  });

  it('surfaces a storage failure', () => {
    renderScreen({ storageError: 'Your profiles could not be read from storage.' });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/i);
  });
});

describe('ProfileScreen editing and adding', () => {
  it('opens a blank form to add a profile', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /add a profile/i }));

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
  });

  it('opens the chosen profile filled in for editing', () => {
    renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /edit/i }));

    expect(screen.getByLabelText(/name/i)).toHaveValue('Mei');
  });

  it('returns to the list after saving, and reports the change', async () => {
    const props = renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '56' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => { expect(props.onChanged).toHaveBeenCalled(); });
    // Back on the list, not left sitting on the form.
    expect(screen.getByTestId('profile-p1')).toBeInTheDocument();
  });

  it('makes a newly added profile the active one', async () => {
    const props = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /add a profile/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Adik' } });
    fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '170' } });
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    // You just created it, so it is the one you meant to use.
    await waitFor(() => { expect(props.onSetActive).toHaveBeenCalled(); });
  });

  it('abandons the form without reporting a change', () => {
    const props = renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /add a profile/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByTestId('profile-p1')).toBeInTheDocument();
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});

describe('ProfileScreen deleting', () => {
  it('asks before deleting', () => {
    renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));

    expect(screen.getByText(/delete .*Mei/i)).toBeInTheDocument();
    // A question with its own buttons is not an assertive announcement —
    // role="alert" stays reserved for a failed write (execution record §3.5).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the profile when the deletion is declined', async () => {
    await db.profiles.put(mei);
    const props = renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }));

    expect(await db.profiles.count()).toBe(1);
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it('deletes the profile once confirmed', async () => {
    await db.profiles.put(ryan);
    await db.profiles.put(mei);
    const props = renderScreen();

    fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => { expect(props.onChanged).toHaveBeenCalled(); });
    expect(await db.profiles.get('p2')).toBeUndefined();
    expect(await db.profiles.get('p1')).toBeDefined();
  });

  it('shows a failed delete as the only alert, and keeps the profile listed', async () => {
    const spy = vi.spyOn(profilesModule, 'deleteProfile').mockRejectedValue(new Error('quota'));
    try {
      const props = renderScreen();

      fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not delete/i);
      expect(props.onChanged).not.toHaveBeenCalled();
      expect(screen.getByTestId('profile-p2')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('clears a previous delete error when the prompt is reopened and cancelled', async () => {
    const spy = vi.spyOn(profilesModule, 'deleteProfile').mockRejectedValue(new Error('quota'));
    try {
      renderScreen();
      fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));
      fireEvent.click(screen.getByRole('button', { name: /yes, delete/i }));
      await screen.findByRole('alert');

      // Both confirm transitions clear the error, so a stale failure cannot
      // resurface beside a fresh prompt (execution record §3.5).
      fireEvent.click(row('p2').getByRole('button', { name: /delete/i }));

      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ProfileScreen groups', () => {
  beforeEach(async () => { await db.groups.clear(); });

  it('offers groups only once there are two people', () => {
    renderScreen({ profiles: [ryan] });
    expect(screen.queryByRole('button', { name: /add a group/i })).toBeNull();
  });

  it('creates a group of everyone by default', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /add a group/i }));
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: 'Family' } });
    fireEvent.click(screen.getByRole('button', { name: /save group/i }));

    const card = await screen.findByText('Family');
    expect(card.closest('article')).toHaveTextContent('Ryan, Mei');
    const [saved] = await db.groups.toArray();
    expect(saved).toMatchObject({ name: 'Family', memberIds: ['p1', 'p2'] });
  });

  it('needs a name and at least two people', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /add a group/i }));
    fireEvent.click(screen.getByRole('button', { name: /save group/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);

    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: 'Family' } });
    fireEvent.click(screen.getByLabelText('Mei'));
    fireEvent.click(screen.getByRole('button', { name: /save group/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/two people/i);
    expect(await db.groups.count()).toBe(0);
  });

  it('deletes a group but keeps its people', async () => {
    await db.groups.put({ id: 'g1', name: 'Family', memberIds: ['p1', 'p2'] });
    renderScreen();
    const card = within(await screen.findByTestId('group-g1'));
    fireEvent.click(card.getByRole('button', { name: /delete group/i }));
    fireEvent.click(card.getByRole('button', { name: /yes, delete/i }));

    await waitFor(() => expect(screen.queryByTestId('group-g1')).toBeNull());
    expect(screen.getByTestId('profile-p2')).toBeInTheDocument();
  });
});
