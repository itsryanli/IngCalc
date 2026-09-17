import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcScreen } from './CalcScreen';
import { db } from '../../storage/db';
import * as userIngredientsModule from '../../storage/userIngredients';
import type { Profile } from '../../core/types';

const profile: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

// Fixed so age (and therefore every calorie/protein figure) can't shift with the calendar.
const today = new Date('2026-06-15T00:00:00Z');

// RNI Malaysia 2017 publishes no bands below 19 — this profile is 18 (2026 - 2008) at `today`.
const under19Profile: Profile = {
  id: 'p2', name: 'Adik', sex: 'male', birthYear: 2008,
  heightCm: 170, weightKg: 60, sessionsPerWeek: 2, goal: 'maintain',
};

beforeEach(async () => { await db.userIngredients.clear(); });

// The cooking-method <select> is queried by role rather than getByLabelText: once a result
// is showing, the MethodCompare table's aria-label ("Method comparison") also matches /method/i
// under getByLabelText's aria-label fallback, which getByRole('combobox', ...) doesn't share.
const selectChicken = async () => {
  await waitFor(() => expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/ingredient/i), { target: { value: 'chicken-breast' } });
  fireEvent.change(screen.getByLabelText(/^weight/i), { target: { value: '1000' } });
  fireEvent.change(screen.getByRole('combobox', { name: /method/i }), { target: { value: 'roasted' } });
};

describe('CalcScreen', () => {
  it('shows the cooked weight for a raw input', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    // chicken-breast's published roasted yield is 0.71 (corrected by Task 9's golden-value
    // suite against real FDC pairs) — not the 0.75 the brief's own worked example assumed.
    // 1000g raw x 0.71 = 710g cooked; see task-19-report.md for the discrepancy note.
    await waitFor(() => expect(screen.getByTestId('result-weight')).toHaveTextContent('710'));
  });

  it('shows the working, including the yield provenance', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByText(/published factor/i)).toBeInTheDocument());
  });

  it('shows the raw weight when the entered weight is cooked', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    fireEvent.click(screen.getByRole('radio', { name: /cooked/i }));
    // 1000g cooked / 0.71 = 1408.45g raw -> "1,408" at zero fraction digits.
    await waitFor(() => expect(screen.getByTestId('result-weight')).toHaveTextContent('1,408'));
  });

  it('shows the share of the daily calorie target when a profile exists', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    // Independently verified against the actual code, not just the plan's worked example:
    // age 30 (2026 - 1996) -> BMR 10*75 + 6.25*175 - 5*30 + 5 = 1698.75 -> TDEE *1.55 (4
    // sessions/week) = 2633.0625 -> maintain factor 1.0 -> calorieTarget = 2633.0625.
    // 1000g raw chicken-breast roasted: kcal 1200 raw x meat/roasted kcal retention 0.95
    // = 1140 cooked kcal. 1140 / 2633.0625 * 100 = 43.29% -> rounds to 43%.
    // Protein: 225 raw x meat/roasted protein retention 0.98 = 220.5g. proteinTargetG =
    // maintain g/kg 1.8 * 75kg = 135g. 220.5 / 135 * 100 = 163.33% -> rounds to 163%.
    // (Previously this test asserted only toHaveTextContent('%'), which passes on NaN% —
    // swapping calorieTarget for tdee, or inverting a division, would fail nothing.)
    await waitFor(() => expect(screen.getByTestId('calorie-share')).toHaveTextContent(
      '43% of your daily calories · 163% of your protein',
    ));
  });

  it('omits the daily share when there is no profile', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByTestId('result-weight')).toBeInTheDocument());
    expect(screen.queryByTestId('calorie-share')).not.toBeInTheDocument();
  });

  it('ranks cooking methods by what they retain', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByRole('table', { name: /method comparison/i })).toBeInTheDocument());
  });

  it('explains why RNI is blank for a profile below RNI Malaysia 2017\'s minimum age (18)', async () => {
    render(<CalcScreen profile={under19Profile} today={today} />);
    await selectChicken();
    // Not a silent blank: rniFor(sex, 18) returns {} (no band starts below 19), so every RNI
    // column would otherwise read "— RNI" with nothing explaining why.
    await waitFor(() => expect(screen.getByText(/publishes figures for ages 19 and over/i)).toBeInTheDocument());
  });

  it('lets the user add a missing ingredient from the picker, then selects it automatically', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await waitFor(() => expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ingredient/i), { target: { value: '__add_new__' } });

    const nameInput = await screen.findByLabelText(/^name/i);
    fireEvent.change(nameInput, { target: { value: 'Petai' } });
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

    // Back on the calculator, the picker now shows the new ingredient, selected.
    const select = await screen.findByLabelText(/ingredient/i) as HTMLSelectElement;
    await waitFor(() => expect(select.selectedOptions[0]?.textContent).toBe('Petai'));

    // And it's usable immediately: entering a weight produces a result.
    fireEvent.change(screen.getByLabelText(/^weight/i), { target: { value: '100' } });
    await waitFor(() => expect(screen.getByTestId('result-weight')).toBeInTheDocument());
  });

  it('lets the user back out of adding an ingredient without writing anything', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await waitFor(() => expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument());

    // A slip of the finger on a dropdown must be recoverable without polluting the catalogue.
    fireEvent.change(screen.getByLabelText(/ingredient/i), { target: { value: '__add_new__' } });
    await screen.findByLabelText(/^name/i);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Back on the calculator, not left showing the sentinel as though it were a real selection.
    const select = await screen.findByLabelText(/ingredient/i) as HTMLSelectElement;
    expect(select.value).toBe('');

    // The one assertion that actually matters: cancelling wrote nothing to storage.
    expect(await db.userIngredients.toArray()).toHaveLength(0);
  });

  it('tells the user plainly when a saved ingredient could not be loaded back into the picker', async () => {
    // useCatalogue.refresh() deliberately swallows storage errors so the calculator keeps
    // working offline — but that means CalcScreen can't assume refresh() actually picked up
    // the ingredient it just asked AddIngredientScreen to save. Force that failure here.
    const spy = vi
      .spyOn(userIngredientsModule, 'listUserIngredients')
      .mockRejectedValue(new Error('storage unavailable'));

    try {
      render(<CalcScreen profile={null} today={today} />);
      await waitFor(() => expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText(/ingredient/i), { target: { value: '__add_new__' } });
      const nameInput = await screen.findByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: 'Petai' } });
      fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

      // The user sees something, not nothing: a plain statement of what happened.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i));

      // And the calculator itself is still there and usable, not a blank/broken screen.
      expect(screen.getByLabelText(/ingredient/i)).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
