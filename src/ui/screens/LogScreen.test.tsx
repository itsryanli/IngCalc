import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogScreen } from './LogScreen';
import { db } from '../../storage/db';
import { dayLogId } from '../../storage/meals';
import type { Batch, CookSession, DayLogTargets, IsoDate, MealEntry, Profile } from '../../core/types';
import { g } from '../../core/units';
import { zeroNutrients } from '../../core/nutrients';

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

/**
 * A non-`quick` entry: it carries no micronutrient penalty, unlike
 * `seedQuickEntry`'s rows. The ingredient id is never resolved (no catalogue
 * entry backs it), which is fine — `entryNutrients` falls back to zero rather
 * than throwing — and irrelevant here, since this fixture exists only to put
 * a non-quick row in the day.
 */
const seedIngredientEntry = async (date: IsoDate) => {
  const entry: MealEntry = {
    id: `entry-${nextId++}`, profileId: profile.id, date, label: 'lunch', createdAt: nextId,
    kind: 'ingredient', ingredientId: 'unresolved', method: 'roasted', cookedG: g(100),
  };
  await db.mealEntries.add(entry);
};

/** A one-portion cook, so a single default-portions save consumes it entirely
 * — the fixture is deliberately sized so "still available" vs "fully eaten"
 * is a clean present/absent assertion rather than a parsed-text comparison. */
const seedSingletonCook = async (sessionId: string, batchId: string) => {
  const batch: Batch = {
    id: batchId, ingredientId: 'unresolved', rawWeightG: g(150),
    purchase: { pricePaidMYR: 15 as never, location: 'Jaya Grocer', date: '2026-09-17' },
    createdAt: 1,
  };
  const session: CookSession = {
    id: sessionId, batchId, method: 'roasted', rawUsedG: g(150), cookedWeightG: g(150),
    cookedAt: '2026-09-17', portionCount: 1, excludeFromCalibration: false,
  };
  await db.batches.put(batch);
  await db.cookSessions.put(session);
};

describe('LogScreen', () => {
  beforeEach(async () => {
    await db.open();
    await db.mealEntries.clear();
    await db.dayLogs.clear();
    await db.batches.clear();
    await db.cookSessions.clear();
  });

  it('keeps showing and counting a meal whose ingredient was later archived', async () => {
    await db.userIngredients.put({
      id: 'my-crackers', name: 'Oat crackers', category: 'other',
      per100gRaw: { ...zeroNutrients(), kcal: 400, protein: 10 }, publishedYield: {},
      absorbsWater: false, defaultMethod: 'asIs', source: 'user', archived: true,
    });
    await db.mealEntries.add({
      id: 'e-crackers', profileId: profile.id, date: '2026-09-19', label: 'lunch', createdAt: 1,
      kind: 'ingredient', ingredientId: 'my-crackers', method: 'asIs', cookedG: g(50),
    });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    expect(await screen.findByText(/oat crackers/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('kcal-progress')).toHaveTextContent('200'));
    await db.userIngredients.clear();
  });

  it('copies a meal from the last day it was logged into an empty meal', async () => {
    await seedQuickEntry({ date: '2026-09-18', kcal: 450, proteinG: 25 });
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    const repeat = await screen.findByRole('button', { name: 'Same as yesterday (1 item)' });
    await userEvent.click(repeat);

    expect(await screen.findByRole('status')).toHaveTextContent('Copied lunch from yesterday.');
    await waitFor(() => expect(screen.getByTestId('kcal-progress')).toHaveTextContent('450'));
    const today = (await db.mealEntries.toArray()).filter((e) => e.date === '2026-09-19');
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ label: 'lunch', kind: 'quick', kcal: 450, proteinG: 25 });
    // The meal is no longer empty, so the offer goes away.
    expect(screen.queryByRole('button', { name: /same as yesterday/i })).not.toBeInTheDocument();
  });

  it('does not offer to repeat a meal that was never logged before', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await screen.findByTestId('day-name');
    expect(screen.queryByRole('button', { name: /same as/i })).not.toBeInTheDocument();
  });

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

    expect(await screen.findByTestId('entry-detail')).toHaveTextContent('Quick add');
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

  it('does not say so on a day whose only entry is not a quick one', async () => {
    // A day with NO entries at all would also pass this assertion, but for
    // the wrong reason: the nutrient card itself is suppressed by
    // `log.entries.length > 0` whenever the day is empty, hardcoding that
    // guard to `true` would still make this pass. A non-quick entry keeps
    // the card rendering while giving `unknownMicroEntries` nothing to count,
    // so the assertion actually exercises the flag's own condition.
    await seedIngredientEntry('2026-09-19');
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    expect(await screen.findByTestId('entry-description')).toBeInTheDocument();
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
    // This pins the *observable* behaviour: opening the second entry's edit
    // form shows the second entry's values, not the first's. It does not by
    // itself prove the `key={view.editing?.id ?? 'new'}` prop on
    // `<AddEntryForm>` is necessary — verified by removing that prop and
    // rerunning this test, which still passed. The reason is LogScreen's own
    // view state machine: `list` and `form` are two structurally different
    // JSX branches, so React already unmounts `AddEntryForm` on every exit
    // from form mode (Cancel/Save -> `list`) before a different entry can
    // ever be chosen — there is no reachable path that hands one mounted
    // instance a second `editing` value. The `key` stays anyway: it matches
    // `AddEntryForm`'s own documented contract and is what keeps this safe
    // if a future layout ever keeps the form mounted beside the list (e.g.
    // an inline or animated edit drawer). The prop-level mechanism the `key`
    // actually guards against is pinned directly in
    // `AddEntryForm.test.tsx` via `rerender` on the same element.
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

  it('passes every entry in the database to the form, not just the viewed day\'s', async () => {
    // A cook fully eaten by an entry logged *yesterday*. The form's remainder
    // must still account for it today: useKitchen's `entries` is every row in
    // storage, which is what `allEntries` documents itself as needing ("a
    // cook made last week can be eaten today") — useLog's `entries` is only
    // the day on screen, and passing that instead would make a food eaten on
    // another day look uneaten.
    await seedSingletonCook('s1', 'b1');
    await db.mealEntries.add({
      id: 'cross-day', profileId: profile.id, date: '2026-09-18', label: 'lunch', createdAt: 1,
      kind: 'portion', cookSessionId: 's1', portions: 1,
    } as MealEntry);

    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(await screen.findByTestId('add-entry'));

    // Confirms the kitchen list finished loading and was actually filtered,
    // rather than the assertion below passing because nothing had loaded yet.
    await screen.findByText(/nothing cooked is left/i);
    expect(screen.queryByTestId('available-s1')).toBeNull();
  });

  it('adds a new entry to the day being viewed, not to today', async () => {
    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));
    await userEvent.click(screen.getByRole('button', { name: /previous day/i }));
    expect(await screen.findByTestId('day-name')).toHaveTextContent('Yesterday');

    await userEvent.click(screen.getByTestId('add-entry'));
    await userEvent.click(screen.getByRole('button', { name: /quick add/i }));
    await userEvent.type(screen.getByLabelText(/what was it/i), 'Roti canai');
    await userEvent.type(screen.getByLabelText(/roughly how many calories/i), '300');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Still viewing yesterday: the entry just added belongs here.
    expect(await screen.findByTestId('entry-description')).toHaveTextContent('Roti canai');
    expect(screen.getByTestId('day-name')).toHaveTextContent('Yesterday');

    // Today must not have picked it up.
    await userEvent.click(screen.getByRole('button', { name: /next day/i }));
    await waitFor(() => expect(screen.getByTestId('day-name')).toHaveTextContent('Today'));
    expect(screen.queryByTestId('entry-description')).toBeNull();
  });

  it('refreshes the kitchen after saving, so a just-eaten cook stops showing as available', async () => {
    await seedSingletonCook('s2', 'b2');

    render(<LogScreen profile={profile} today={new Date(2026, 8, 19)} />);
    await userEvent.click(await screen.findByTestId('add-entry'));
    await userEvent.click(await screen.findByTestId('available-s2'));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // Back on the list. Reopening the form must show the cook as fully eaten:
    // useKitchen's `entries` (the source of every remainder) has to have been
    // refreshed alongside useLog's, or this would still show it as available.
    await userEvent.click(await screen.findByTestId('add-entry'));
    await screen.findByText(/nothing cooked is left/i);
    expect(screen.queryByTestId('available-s2')).toBeNull();
  });
});
