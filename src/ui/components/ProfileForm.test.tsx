import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileForm } from './ProfileForm';
import { db } from '../../storage/db';
import * as profilesModule from '../../storage/profiles';
import type { Profile } from '../../core/types';

// Fixed so the expected values (age 30, TDEE 2633, protein 135g) never drift with the calendar.
const FIXED_TODAY = new Date('2026-06-15T00:00:00Z');

beforeEach(async () => { await db.profiles.clear(); });

const fill = () => {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ryan' } });
  fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '1996' } });
  fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '175' } });
  fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '75' } });
  fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '4' } });
};

const existing: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

describe('ProfileForm editing an existing profile', () => {
  it('fills the form from the profile being edited', () => {
    render(<ProfileForm profile={existing} onSaved={vi.fn()} today={FIXED_TODAY} />);

    expect(screen.getByLabelText(/name/i)).toHaveValue('Ryan');
    expect(screen.getByLabelText(/birth year/i)).toHaveValue(1996);
    expect(screen.getByLabelText(/weight/i)).toHaveValue(75);
  });

  it('keeps the id, rather than saving a second profile', async () => {
    await db.profiles.put(existing);

    render(<ProfileForm profile={existing} onSaved={vi.fn()} today={FIXED_TODAY} />);
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    // The bug: toProfile() called newId() unconditionally, so correcting your
    // weight left two profiles and the app showed whichever UUID sorted first.
    await waitFor(async () => { expect(await db.profiles.count()).toBe(1); });
    const saved = (await db.profiles.toArray())[0]!;
    expect(saved.id).toBe('p1');
    expect(saved.weightKg).toBe(72);
  });

  it('drops a protein override that is cleared while editing', async () => {
    await db.profiles.put({ ...existing, proteinGPerKg: 2.4 });

    render(
      <ProfileForm profile={{ ...existing, proteinGPerKg: 2.4 }} onSaved={vi.fn()} today={FIXED_TODAY} />,
    );
    expect(screen.getByLabelText(/protein target override/i)).toHaveValue(2.4);

    fireEvent.change(screen.getByLabelText(/protein target override/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(async () => {
      expect((await db.profiles.get('p1'))?.proteinGPerKg).toBeUndefined();
    });
  });
});

describe('ProfileForm', () => {
  it('shows the computed targets as the form is filled in', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    await waitFor(() => {
      // Displayed with a thousands separator, as NutrientTable already does.
      expect(screen.getByTestId('tdee')).toHaveTextContent('2,633');
      expect(screen.getByTestId('calorie-target')).toHaveTextContent('2,633');
    });
  });

  it('shows the protein target in both g/kg and g/lb', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    await waitFor(() => {
      expect(screen.getByTestId('protein-target')).toHaveTextContent('135');
      expect(screen.getByTestId('protein-target')).toHaveTextContent('g/lb');
    });
  });

  it('refuses to save without a name', async () => {
    const onSaved = vi.fn();
    render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects an implausible birth year', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/birth year/i);
  });

  it('persists the profile and reports it', async () => {
    const onSaved = vi.fn();
    render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await db.profiles.count()).toBe(1);
  });

  it('rejects a height just below the lower bound (79cm)', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '79' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/height/i);
  });

  it('accepts a height at the lower bound (80cm)', async () => {
    const onSaved = vi.fn();
    render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects a weight just below the lower bound (19kg)', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/weight/i);
  });

  it('accepts a weight at the lower bound (20kg)', async () => {
    const onSaved = vi.fn();
    render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects sessions just above the upper bound (22/week)', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sessions/i);
  });

  it('accepts sessions at the upper bound (21/week)', async () => {
    const onSaved = vi.fn();
    render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a plain-language error and does not call onSaved when saving fails', async () => {
    // Dexie can reject (private browsing, quota, a blocked upgrade). Without a try/catch
    // around the save, that rejection is unhandled, onSaved never fires, and the user taps
    // Save to absolutely nothing: no error, no navigation, form unchanged.
    const onSaved = vi.fn();
    const spy = vi.spyOn(profilesModule, 'saveProfile').mockRejectedValue(new Error('storage unavailable'));
    try {
      render(<ProfileForm onSaved={onSaved} today={FIXED_TODAY} />);
      fill();
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
      expect(onSaved).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('explains a target on demand, with the user\'s own numbers in the working', async () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();

    const toggle = await screen.findByRole('button', { name: /how BMR is worked out/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Not a generic formula — the profile's own height, weight and age.
    expect(screen.getByText(/10 × 75kg \+ 6.25 × 175cm − 5 × 30 \+ 5/)).toBeInTheDocument();
    // Named in both the step label and its source note, hence getAllByText.
    expect(screen.getAllByText(/Mifflin-St Jeor/i).length).toBeGreaterThan(0);
  });

  it('keeps the working hidden until asked for', () => {
    render(<ProfileForm onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    // The panel exists in the DOM but is hidden, so nothing reads it out or shows it.
    expect(screen.getAllByText(/Mifflin-St Jeor/i)[0]).not.toBeVisible();
  });
});
