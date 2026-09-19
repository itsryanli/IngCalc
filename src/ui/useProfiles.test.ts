import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { useProfiles } from './useProfiles';
import { db } from '../storage/db';
import { saveProfile } from '../storage/profiles';
import * as profilesModule from '../storage/profiles';
import { getSettings, setActiveProfile } from '../storage/settings';
import type { Profile } from '../core/types';

const profile = (id: string, name: string): Profile => ({
  id, name, sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
});

beforeEach(async () => {
  await db.profiles.clear();
  await db.settings.clear();
});

describe('useProfiles', () => {
  it('loads every profile on mount', async () => {
    await saveProfile(profile('p1', 'Ryan'));
    await saveProfile(profile('p2', 'Mei'));

    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.profiles.map((p) => p.name).sort()).toEqual(['Mei', 'Ryan']);
  });

  it('makes the stored active profile the active one', async () => {
    await saveProfile(profile('p1', 'Ryan'));
    await saveProfile(profile('p2', 'Mei'));
    await setActiveProfile('p2');

    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    // The bug this replaces: App took profiles[0], so the answer depended on
    // UUID sort order rather than on what the user chose.
    expect(result.current.active?.id).toBe('p2');
  });

  it('falls back to the first profile when none has been chosen', async () => {
    await saveProfile(profile('p1', 'Ryan'));

    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    // Existing installs have activeProfileId null and must keep working.
    expect(result.current.active?.id).toBe('p1');
  });

  it('falls back when the stored active profile no longer exists', async () => {
    await saveProfile(profile('p1', 'Ryan'));
    await setActiveProfile('deleted-in-another-tab');

    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.active?.id).toBe('p1');
  });

  it('has no active profile when none are stored', async () => {
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(result.current.active).toBeNull();
    expect(result.current.profiles).toEqual([]);
  });

  it('persists a switch, so it survives a reload', async () => {
    await saveProfile(profile('p1', 'Ryan'));
    await saveProfile(profile('p2', 'Mei'));

    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    await act(async () => { await result.current.setActive('p2'); });

    expect(result.current.active?.id).toBe('p2');
    expect((await getSettings()).activeProfileId).toBe('p2');
  });

  it('surfaces a storage failure rather than showing an empty list', async () => {
    const spy = vi.spyOn(profilesModule, 'listProfiles').mockRejectedValue(new Error('quota'));
    try {
      const { result } = renderHook(() => useProfiles());
      await waitFor(() => { expect(result.current.loading).toBe(false); });

      // An empty list and an unreadable one must not look the same on screen.
      expect(result.current.storageError).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('picks up a newly saved profile on refresh', async () => {
    const { result } = renderHook(() => useProfiles());
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    await saveProfile(profile('p1', 'Ryan'));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.profiles.map((p) => p.id)).toEqual(['p1']);
  });
});
