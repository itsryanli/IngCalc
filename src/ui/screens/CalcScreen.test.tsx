import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalcScreen } from './CalcScreen';
import { db } from '../../storage/db';
import * as userIngredientsModule from '../../storage/userIngredients';
import * as kitchenStorageModule from '../../storage/kitchen';
import type { Profile } from '../../core/types';
import { g, myr } from '../../core/units';

// The ingredient control is a typeahead combobox, not a <select>, so it is driven by
// typing and pressing a listbox option rather than by setting a value. Options activate
// on mousedown (the input's blur would otherwise close the list before a click landed),
// which is why press() dispatches mousedown rather than click.
const press = (el: HTMLElement) => fireEvent.mouseDown(el);

const pickIngredient = async (labelText: RegExp) => {
  const input = await screen.findByRole('combobox', { name: /ingredient/i });
  fireEvent.focus(input);
  press(await screen.findByRole('option', { name: labelText }));
};

const openAddIngredient = async () => {
  const input = await screen.findByRole('combobox', { name: /ingredient/i });
  fireEvent.focus(input);
  press(await screen.findByRole('option', { name: /Add a new ingredient/i }));
};


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
  await pickIngredient(/^Chicken breast/);
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
    await openAddIngredient();

    const nameInput = await screen.findByLabelText(/^name/i);
    fireEvent.change(nameInput, { target: { value: 'Petai' } });
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

    // Back on the calculator, the picker now shows the new ingredient, selected.
    const picker = await screen.findByRole('combobox', { name: /ingredient/i }) as HTMLInputElement;
    await waitFor(() => expect(picker.value).toBe('Petai'));

    // And it's usable immediately: entering a weight produces a result.
    fireEvent.change(screen.getByLabelText(/^weight/i), { target: { value: '100' } });
    await waitFor(() => expect(screen.getByTestId('result-weight')).toBeInTheDocument());
  });

  it('lets the user back out of adding an ingredient without writing anything', async () => {
    render(<CalcScreen profile={null} today={today} />);

    // A slip of the finger on a dropdown must be recoverable without polluting the catalogue.
    await openAddIngredient();
    await screen.findByLabelText(/^name/i);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Back on the calculator, not left showing the sentinel as though it were a real selection.
    const picker = await screen.findByRole('combobox', { name: /ingredient/i }) as HTMLInputElement;
    expect(picker.value).toBe('');

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
      await openAddIngredient();
      const nameInput = await screen.findByLabelText(/^name/i);
      fireEvent.change(nameInput, { target: { value: 'Petai' } });
      fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));

      // The user sees something, not nothing: a plain statement of what happened.
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i));

      // And the calculator itself is still there and usable, not a blank/broken screen.
      expect(screen.getByRole('combobox', { name: /ingredient/i })).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('CalcScreen calibration', () => {
  beforeEach(async () => {
    await db.batches.clear();
    await db.cookSessions.clear();
  });

  afterEach(async () => {
    await db.batches.clear();
    await db.cookSessions.clear();
  });

  it('uses the published factor while the user has no cooks logged', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('710g');
    });
    expect(screen.getByText(/published factor/i)).toBeInTheDocument();
  });

  it('switches to the user own measured average once a cook is logged', async () => {
    // One cook at 0.60 rather than the published 0.71.
    await db.batches.put({
      id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
      purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
      createdAt: 0,
    });
    await db.cookSessions.put({
      id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(1000),
      cookedWeightG: g(600), cookedRemainingG: g(600), cookedAt: '2026-09-19',
      portionCount: 4, excludeFromCalibration: false,
    });

    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('600g');
    });
    expect(screen.getByText(/your average across 1 cook/i)).toBeInTheDocument();
  });

  it('honours an excluded cook, falling back to the published factor', async () => {
    await db.batches.put({
      id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
      purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
      createdAt: 0,
    });
    await db.cookSessions.put({
      id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(1000),
      cookedWeightG: g(600), cookedRemainingG: g(600), cookedAt: '2026-09-19',
      portionCount: 4, excludeFromCalibration: true,
    });

    render(<CalcScreen profile={null} />);
    await selectChicken();

    await waitFor(() => {
      expect(screen.getByTestId('result-weight')).toHaveTextContent('710g');
    });
  });

  it('offers to log the calculated weight as a batch', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();

    fireEvent.click(await screen.findByRole('button', { name: /log this as a batch/i }));

    // Prefilled from the calculator, so the user does not retype it.
    expect(screen.getByLabelText(/^raw weight/i)).toHaveValue(1000);
    // CalcScreen's own injected `today` must reach the batch form, not the form's
    // own `new Date()` fallback, so the purchase date stays testable/pinnable.
    expect(screen.getByLabelText(/^date/i)).toHaveValue('2026-06-15');
  });

  it('warns when the kitchen could not be read, and falls back to the published factor', async () => {
    // A logged cook exists (0.60 measured), but loadKitchen rejects before it can be
    // read — an empty kitchen and an unreadable one must not look the same on screen.
    await db.batches.put({
      id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
      purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' },
      createdAt: 0,
    });
    await db.cookSessions.put({
      id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: g(1000),
      cookedWeightG: g(600), cookedRemainingG: g(600), cookedAt: '2026-09-19',
      portionCount: 4, excludeFromCalibration: false,
    });

    const spy = vi.spyOn(kitchenStorageModule, 'loadKitchen').mockRejectedValue(new Error('quota'));
    try {
      render(<CalcScreen profile={null} />);
      await selectChicken();

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not be read/i));
      // The user's own 0.60 figure is unreachable, so this must read 710g (published
      // factor), not 600g (their measured one) or a silently blank result.
      expect(screen.getByTestId('result-weight')).toHaveTextContent('710g');
    } finally {
      spy.mockRestore();
    }
  });

  it('still reaches the add-ingredient form when "add new" is opened from inside the batch form', async () => {
    render(<CalcScreen profile={null} />);
    await selectChicken();

    fireEvent.click(await screen.findByRole('button', { name: /log this as a batch/i }));
    // AddBatchForm renders its own IngredientPicker wired to the same onAddNew handler
    // as the calculator's — that's the composition this test exercises, not just reads.
    await openAddIngredient();

    // Without clearing loggingBatch, the batch-form branch keeps winning the ternary
    // and this never appears: the picker just closes with no visible effect.
    expect(await screen.findByLabelText(/^name/i)).toBeInTheDocument();
  });
});

/* ==========================================================================
   The portion split

   Figures follow from the suite's already-verified ones: 1000g raw chicken
   breast roasted = 710g cooked, 1140 kcal, 220.5g protein, against targets of
   2633.0625 kcal and 135g protein. Divided by 4: 177.5g ("178g" at formatG's
   zero fraction digits above 10), 285 kcal (10.82% -> 11%), 55.125g protein
   (40.83% -> 41%, and "55.1g" in the table).
   ========================================================================== */

const splitInto = (portions: string) =>
  fireEvent.change(screen.getByLabelText(/split into/i), { target: { value: portions } });

describe('CalcScreen portion split', () => {
  it('defaults to a single portion, leaving the whole-cook figures showing', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();

    await waitFor(() => expect(screen.getByLabelText(/split into/i)).toHaveValue(1));
    expect(screen.getByTestId('calorie-share')).toHaveTextContent('43%');
    expect(screen.getByTestId('calorie-share')).toHaveTextContent('163%');
  });

  it('shows the weight of one portion', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('4');

    await waitFor(() => expect(screen.getByTestId('portion-weight')).toHaveTextContent('178g'));
  });

  it('divides the share of the daily targets by the portion count', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('4');

    await waitFor(() => expect(screen.getByTestId('calorie-share')).toHaveTextContent('11%'));
    expect(screen.getByTestId('calorie-share')).toHaveTextContent('41%');
  });

  it('divides the nutrient table amounts by the portion count', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    await waitFor(() => expect(screen.getByText('220.5g')).toBeInTheDocument());

    splitInto('4');

    await waitFor(() => expect(screen.getByText('55.1g')).toBeInTheDocument());
    expect(screen.queryByText('220.5g')).not.toBeInTheDocument();
  });

  it('says the nutrients are per portion once the cook is split', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('4');

    await waitFor(() => expect(screen.getByText(/nutrients.*per portion/i)).toBeInTheDocument());
  });

  it('divides the cooked weight, not the entered weight, when a cooked weight was entered', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    fireEvent.click(screen.getByRole('radio', { name: /cooked/i }));
    splitInto('4');

    // 1000g cooked / 0.71 = 1408.45g raw, which cooks back to 1000g: 250g a portion.
    // Dividing the 1,408g raw figure instead would read "352g".
    await waitFor(() => expect(screen.getByTestId('portion-weight')).toHaveTextContent('250g'));
  });

  it('keeps the split when the cooking method changes', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('4');
    await waitFor(() => expect(screen.getByTestId('portion-weight')).toHaveTextContent('178g'));

    fireEvent.change(screen.getByRole('combobox', { name: /method/i }), { target: { value: 'boiled' } });

    await waitFor(() => expect(screen.getByLabelText(/split into/i)).toHaveValue(4));
    expect(screen.getByText(/nutrients.*per portion/i)).toBeInTheDocument();
  });

  it('falls back to one portion when the field is cleared, rather than dividing by nothing', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('4');
    await waitFor(() => expect(screen.getByTestId('calorie-share')).toHaveTextContent('11%'));

    splitInto('');

    // Number('') is 0, and 1140/0 is Infinity: "Infinity%" is the failure this guards.
    await waitFor(() => expect(screen.getByTestId('calorie-share')).toHaveTextContent('43%'));
    expect(screen.getByTestId('calorie-share')).not.toHaveTextContent('Infinity');
  });

  it('splits the cook without a profile, showing portion weight but no target share', async () => {
    render(<CalcScreen profile={null} today={today} />);
    await selectChicken();
    splitInto('4');

    await waitFor(() => expect(screen.getByTestId('portion-weight')).toHaveTextContent('178g'));
    expect(screen.getByText(/nutrients.*per portion/i)).toBeInTheDocument();
    // Targets come from the profile, so there is nothing to show a share against.
    expect(screen.queryByTestId('calorie-share')).not.toBeInTheDocument();
  });

  it('ignores a fractional portion count rather than splitting into half a container', async () => {
    render(<CalcScreen profile={profile} today={today} />);
    await selectChicken();
    splitInto('2.5');

    // Portions are whole containers; 2.5 is held as the previous valid count.
    await waitFor(() => expect(screen.getByTestId('portion-weight')).toHaveTextContent('710g'));
  });
});
