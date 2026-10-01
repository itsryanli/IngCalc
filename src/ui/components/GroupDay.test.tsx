import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import { GroupDay } from './GroupDay';
import { db } from '../../storage/db';
import type { MealContext } from '../../core/meals';
import type { Profile } from '../../core/types';

const person = (id: string, name: string): Profile => ({
  id, name, sex: 'male', birthYear: 1996, heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
});
const profiles = [person('p1', 'Ryan'), person('p2', 'Mei')];

const ctx: MealContext = {
  sessions: [], batches: [], ingredientById: () => undefined,
  samples: [], categoryYield: {} as never, retention: {} as never,
};

const quick = (id: string, profileId: string, kcal: number, proteinG?: number) => ({
  id, profileId, date: '2026-09-30', label: 'lunch' as const, createdAt: 1,
  kind: 'quick' as const, name: 'Nasi lemak', kcal, ...(proteinG === undefined ? {} : { proteinG }),
});

beforeEach(async () => {
  await db.mealEntries.clear();
  await db.dayLogs.clear();
});

describe('GroupDay', () => {
  it('shows each member\'s day against their own targets', async () => {
    await db.mealEntries.bulkPut([quick('e1', 'p1', 600, 20), quick('e2', 'p2', 450)]);
    await db.dayLogs.put({ id: 'p2:2026-09-30', profileId: 'p2', date: '2026-09-30',
      targets: { kcal: 1800, proteinG: 90, micros: {} } });

    render(
      <GroupDay group={{ id: 'g1', name: 'Family', memberIds: ['p1', 'p2'] }} profiles={profiles}
        date="2026-09-30" ctx={ctx} today={new Date(2026, 8, 30)} version={0} />,
    );

    const ryan = within(await screen.findByTestId('group-day-p1'));
    expect(ryan.getByText('Ryan')).toBeInTheDocument();
    expect(ryan.getByText(/^600 \//)).toBeInTheDocument();
    expect(ryan.getByText(/20 \/ \d+g protein/)).toBeInTheDocument();

    const mei = within(screen.getByTestId('group-day-p2'));
    expect(mei.getByText('450 / 1,800 kcal')).toBeInTheDocument();
    // Protein left blank on a quick entry: the figure is a floor, said so.
    expect(mei.getByText('at least 0 / 90g protein')).toBeInTheDocument();
  });
});
