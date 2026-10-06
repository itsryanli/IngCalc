import { useMemo, useState } from 'react';
import { startingMethod } from '../../core/methods';
import { recentIngredientIds } from '../../core/recent';
import { COOK_METHODS, NOT_COOKED, type CookMethod, type Ingredient, type NutrientKey, type Profile } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { computeCooked, rawFromCooked } from '../../core/nutrition';
import { perPortion } from '../../core/batch';
import { compareMethods } from '../../core/methodCompare';
import { ageFrom, calorieTarget, microTargets, proteinTargetG } from '../../core/targets';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { RETENTION } from '../../data/retentionTable';
import { RNI_MIN_AGE, rniFor } from '../../data/rniMY';
import { DV_US } from '../../data/dvUS';
import { listUserIngredients } from '../../storage/userIngredients';
import { useCatalogue } from '../useCatalogue';
import { useKitchen } from '../useKitchen';
import { WeightInput, type WeightUnit } from '../components/WeightInput';
import { CalcTrace } from '../components/CalcTrace';
import { NutrientTable } from '../components/NutrientTable';
import { MethodCompare } from '../components/MethodCompare';
import { IngredientPicker } from '../components/IngredientPicker';
import { PortionSplit } from '../components/PortionSplit';
import { AddIngredientScreen } from './AddIngredientScreen';
import { METHOD_LABELS } from '../labels';

const HIGHLIGHT: NutrientKey[] = ['potassium', 'iron', 'magnesium'];

export function CalcScreen({ profile, today = new Date() }: { profile: Profile | null; today?: Date }) {
  const { catalogue, refresh } = useCatalogue();
  // The point of Phase 2: resolveYield's `measured` branch has been
  // unreachable since Phase 1 because nothing produced samples.
  const { samples, batches, sessions, entries, storageError: kitchenError } = useKitchen();
  const recentIds = useMemo(
    () => recentIngredientIds(batches, sessions, entries), [batches, sessions, entries]);
  const [ingredientId, setIngredientId] = useState('');
  /** Whole containers, at least one. `PortionSplit` guarantees both, so dividing by it is safe. */
  const [portionCount, setPortionCount] = useState(1);
  const [weight, setWeight] = useState<Grams>(g(0));
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [entered, setEntered] = useState<'raw' | 'cooked'>('raw');
  const [method, setMethod] = useState<CookMethod>('roasted');
  const [addingIngredient, setAddingIngredient] = useState(false);
  /** Seeds the add-ingredient form with whatever the user had typed into the picker. */
  const [addInitialName, setAddInitialName] = useState('');
  const [addIngredientError, setAddIngredientError] = useState<string | null>(null);

  const ingredient = catalogue.find((i) => i.id === ingredientId) ?? null;
  const asIs = method === NOT_COOKED;

  // Each ingredient starts on its usual method (crackers: not cooked), which
  // the person can still change.
  const selectIngredient = (picked: Ingredient | undefined) => {
    setIngredientId(picked?.id ?? '');
    if (picked !== undefined) setMethod((m) => startingMethod(picked, m));
  };

  const handleAddNew = (typedName: string) => {
    setAddIngredientError(null);
    setAddInitialName(typedName);
    setAddingIngredient(true);
  };

  // The picker is unmounted while adding, and ingredientId was never changed on the way in,
  // so returning here (via save or cancel) always lands back on whatever was genuinely
  // selected before.
  const handleAddCancelled = () => {
    setAddingIngredient(false);
  };

  const handleIngredientAdded = async (added: Ingredient) => {
    // The ingredient is already persisted (AddIngredientScreen saved it before calling us);
    // refresh() re-merges the catalogue from storage so it shows up.
    await refresh();

    // refresh() deliberately swallows storage errors (the calculator must keep working
    // offline/in private browsing), so it can't tell us whether THIS refresh actually picked
    // up what we just saved. Confirm directly from storage rather than assuming success —
    // otherwise a failed refresh silently strands the user on a blank calculator.
    let confirmed: Ingredient[] = [];
    try {
      confirmed = await listUserIngredients();
    } catch {
      confirmed = [];
    }

    setAddingIngredient(false);

    if (confirmed.some((i) => i.id === added.id)) {
      setAddIngredientError(null);
      selectIngredient(added);
    } else {
      setAddIngredientError(
        `"${added.name}" was saved, but could not be loaded back into the list just now. ` +
        'Try again, or pick it from the ingredient list once storage is available.',
      );
    }
  };

  const result = useMemo(() => {
    if (ingredient === null || weight <= 0) return null;
    const rawG = entered === 'raw' || method === NOT_COOKED
      ? weight
      : rawFromCooked(ingredient, weight, method, samples, CATEGORY_YIELD).rawWeightG;
    const cooked = computeCooked({
      ingredient, rawG, method, samples, categoryYield: CATEGORY_YIELD, retention: RETENTION,
    });
    return { cooked, shownWeight: entered === 'raw' || method === NOT_COOKED ? cooked.cookedWeightG : rawG };
  }, [ingredient, weight, entered, method, samples]);

  // Kept apart from `result` so changing the split does not recompute the cook.
  const shownTotals = useMemo(
    () => (result === null ? null : perPortion(result.cooked.totals, portionCount)),
    [result, portionCount],
  );

  const rows = useMemo(
    () => (ingredient === null ? [] : compareMethods(ingredient, samples, CATEGORY_YIELD, RETENTION, HIGHLIGHT)),
    [ingredient, samples],
  );

  const targets = useMemo(
    () => (profile === null ? {} : microTargets(profile, today, rniFor, DV_US)),
    [profile, today],
  );

  // RNI Malaysia 2017 has no bands below 19; below that, rniFor(...) silently returns {} and
  // every RNI column would read "— RNI" with no explanation. Surface why instead of hiding it.
  const belowRniAge = profile !== null && ageFrom(profile, today) < RNI_MIN_AGE;

  return (
    <section className="screen">
      <h2>Calculator</h2>

      {addingIngredient ? (
        <AddIngredientScreen
          initialName={addInitialName}
          onSaved={(added) => { void handleIngredientAdded(added); }}
          onCancel={handleAddCancelled}
        />
      ) : (
        <>
          {kitchenError !== null && (
            <p role="alert" className="banner banner--warn">
              Your logged cooks could not be read, so these figures use published factors.
            </p>
          )}

          <IngredientPicker
            catalogue={catalogue}
            value={ingredientId}
            recentIds={recentIds}
            onChange={(id) => selectIngredient(catalogue.find((i) => i.id === id))}
            onAddNew={handleAddNew}
          />
          {addIngredientError !== null && <p role="alert">{addIngredientError}</p>}

          <WeightInput label="Weight" value={weight} unit={unit} onChange={setWeight} onUnitChange={setUnit} />

          {!asIs && <fieldset>
            <legend>This weight is</legend>
            <div className="choice-row">
            {(['raw', 'cooked'] as const).map((s) => (
              <label key={s} className="choice">
                <input type="radio" name="entered" value={s} checked={entered === s} onChange={() => setEntered(s)} />
                {s}
              </label>
            ))}
            </div>
          </fieldset>}

          <div className="field">
          <label htmlFor="method">Cooking method</label>
          <select id="method" value={method} onChange={(e) => setMethod(e.target.value as CookMethod)}>
            {COOK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </select>
          </div>

          {result !== null && (
            <>
              <div className="card">
                {!asIs && (
                  <p className="result" data-testid="result-weight">
                    {result.shownWeight.toLocaleString('en-MY', { maximumFractionDigits: 0 })}g{' '}
                    <span className="result__unit">{entered === 'raw' ? 'cooked' : 'raw'}</span>
                  </p>
                )}

                <CalcTrace steps={result.cooked.steps} />
              </div>

              <PortionSplit
                value={portionCount}
                cookedWeightG={result.cooked.cookedWeightG}
                onChange={setPortionCount}
              />

              <div className="card">
                <h3 className="card__title">
                  Nutrients{portionCount > 1 && ' (per portion)'}
                </h3>
                <div className="table-scroll">
              <NutrientTable
                totals={shownTotals ?? result.cooked.totals}
                targets={targets}
                assumedRetentionFor={result.cooked.assumedRetentionFor}
                unknown={ingredient?.unknownNutrients ?? []}
                belowRniAge={belowRniAge}
              />
                </div>
              </div>

              {profile !== null && (
                <p className="share" data-testid="calorie-share">
                  {portionCount > 1 && 'One portion = '}
                  {Math.round(((shownTotals ?? result.cooked.totals).kcal / calorieTarget(profile, today)) * 100)}% of your daily
                  calories · {Math.round(((shownTotals ?? result.cooked.totals).protein / proteinTargetG(profile)) * 100)}% of your protein
                </p>
              )}

              {!asIs && (
                <div className="card">
                  <h3 className="card__title">Which method keeps the most</h3>
                  <div className="table-scroll">
                    <MethodCompare rows={rows} highlight={HIGHLIGHT} />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
