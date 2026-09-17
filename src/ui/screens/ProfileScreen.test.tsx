import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileScreen } from './ProfileScreen';
import { db } from '../../storage/db';
import * as profilesModule from '../../storage/profiles';

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

describe('ProfileScreen', () => {
  it('shows the computed targets as the form is filled in', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    await waitFor(() => {
      expect(screen.getByTestId('tdee')).toHaveTextContent('2633');
      expect(screen.getByTestId('calorie-target')).toHaveTextContent('2633');
    });
  });

  it('shows the protein target in both g/kg and g/lb', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    await waitFor(() => {
      expect(screen.getByTestId('protein-target')).toHaveTextContent('135');
      expect(screen.getByTestId('protein-target')).toHaveTextContent('g/lb');
    });
  });

  it('refuses to save without a name', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects an implausible birth year', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/birth year/i), { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/birth year/i);
  });

  it('persists the profile and reports it', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await db.profiles.count()).toBe(1);
  });

  it('rejects a height just below the lower bound (79cm)', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '79' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/height/i);
  });

  it('accepts a height at the lower bound (80cm)', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects a weight just below the lower bound (19kg)', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/weight/i);
  });

  it('accepts a weight at the lower bound (20kg)', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects sessions just above the upper bound (22/week)', async () => {
    render(<ProfileScreen onSaved={vi.fn()} today={FIXED_TODAY} />);
    fill();
    fireEvent.change(screen.getByLabelText(/sessions per week/i), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sessions/i);
  });

  it('accepts sessions at the upper bound (21/week)', async () => {
    const onSaved = vi.fn();
    render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
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
      render(<ProfileScreen onSaved={onSaved} today={FIXED_TODAY} />);
      fill();
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
      expect(onSaved).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
