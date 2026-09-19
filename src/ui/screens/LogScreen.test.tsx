import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogScreen } from './LogScreen';
import { db } from '../../storage/db';
import { dayLogId } from '../../storage/meals';
import type { DayLogTargets, IsoDate, MealEntry, Profile } from '../../core/types';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

let nextId = 1;

/**
 * Writes a quick entry directly to storage, bypassing AddEntryForm — these
 * tests are about LogScreen's own assembly (day switching, frozen targets,
 * the micro-floor flag), not about the form that is already covered by its
 * own suite.
 */
const seedQuickEntry = async ({
  date, kcal, proteinG, targets,
}: { date: IsoDate; kcal: number; proteinG?: number; targets?: DayLogTargets }) => {
  const entry: MealEntry = {
    id: `entry-${nextId++}`, profileId: profile.id, date, label: 'lunch', createdAt: nextId,
    kind: 'quick', name: 'Test food', kcal,
    ...(proteinG === undefined ? {} : { proteinG }),
  };
  await db.mealEntries.add(entry);
  if (targets !== undefined) {
    await db.dayLogs.put({ id: dayLogId(profile.id, date), profileId: profile.id, date, targets });
  }
};

describe('LogScreen', () => {
  beforeEach(async () => { await db.open(); await db.mealEntries.clear(); await db.dayLogs.clear(); });

  it('asks for a profile before anything else', () => {
    render(<LogScreen profile={null} today={new Date(2026, 8, 19)} />);
    expect(screen.getByTestId('log-no-profile')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to breakfast/i })).toBeNull();
  });

  it('opens on today with four empty meals', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));

    for (const name of ['Breakfast', 'Lunch', 'Dinner', 'Snacks']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('shows a logged entry against the day\'s targets', async () => {
    await seedQuickEntry({ date: '2026-09-19', kcal: 500, proteinG: 30 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);

    expect(await screen.findByTestId('entry-description')).toHaveTextContent('(quick)');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('500');
  });

  it('steps back to a past day and shows what was logged there', async () => {
    await seedQuickEntry({ date: '2026-09-18', kcal: 700 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));

    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    expect(await screen.findByTestId('day-name')).toHaveTextContent('Yesterday');
    expect(screen.getByTestId('kcal-progress')).toHaveTextContent('700');
  });

  it('measures a past day against its own frozen targets, not the current ones', async () => {
    // A DayLog written when the target was 2,000 kcal.
    await seedQuickEntry({ date: '2026-09-18', kcal: 1000, targets: { kcal: 2000, proteinG: 150, micros: {} } });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    // 1000 of 2000 is 50%. Against the profile's real target it would not be.
    expect(await screen.findByTestId('kcal-progress')).toHaveTextContent('50%');
  });

  it('lets a past day be edited', async () => {
    await seedQuickEntry({ date: '2026-09-18', kcal: 700 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));

    // Forgetting to log dinner and fixing it the next morning is the most
    // ordinary thing a food diary has to handle.
    expect(await screen.findByRole('button', { name: /add to dinner/i })).toBeEnabled();
  });

  it('defaults the meal to the time of day', async () => {
    // 09:00 is breakfast; the form should open on it.
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19, 9, 0)} />);
    await userEvent.click(await screen.findByTestId('add-entry'));
    expect(screen.getByRole('heading', { name: /add to breakfast/i })).toBeInTheDocument();
  });

  it('says the micronutrients are a floor when a quick entry is in the day', async () => {
    await seedQuickEntry({ date: '2026-09-19', kcal: 500, proteinG: 30 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);

    expect(await screen.findByTestId('micro-floor')).toHaveTextContent(/at least/i);
  });

  it('does not say so on a day with no quick entries', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toBeInTheDocument());
    expect(screen.queryByTestId('micro-floor')).toBeNull();
  });

  it('surfaces a read failure rather than looking like an empty day', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await db.open();
  });

  it('switches drafts when the edited entry changes, not just when editing starts', async () => {
    // AddEntryForm seeds every field from a useState initializer that runs
    // once per mount. Without a `key` that changes with the edited entry,
    // switching from editing entry A to editing entry B (or add -> edit)
    // reuses A's mounted instance and silently keeps A's draft in every
    // field, then writes it under B's id at save time. This test is the
    // regression that guards the `key={view.editing?.id ?? 'new'}` line in
    // LogScreen — remove that key and this fails.
    await seedQuickEntry({ date: '2026-09-19', kcal: 111, proteinG: 11 });
    await seedQuickEntry({ date: '2026-09-19', kcal: 222, proteinG: 22 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);

    const rows = await screen.findAllByTestId('entry-description');
    expect(rows).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0]!);
    expect(await screen.findByLabelText(/roughly how many calories/i)).toHaveValue(111);

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    await userEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[1]!);
    expect(await screen.findByLabelText(/roughly how many calories/i)).toHaveValue(222);
  });
});
