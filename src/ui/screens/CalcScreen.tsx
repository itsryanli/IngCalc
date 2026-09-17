import { useMemo, useState } from 'react';
import { COOK_METHODS, type CookMethod, type Ingredient, type NutrientKey, type Profile } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { computeCooked, rawFromCooked } from '../../core/nutrition';
import { compareMethods } from '../../core/methodCompare';
import { calorieTarget, microTargets, proteinTargetG } from '../../core/targets';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { RETENTION } from '../../data/retentionTable';
import { rniFor } from '../../data/rniMY';
import { DV_US } from '../../data/dvUS';
import { useCatalogue } from '../useCatalogue';
import { WeightInput, type WeightUnit } from '../components/WeightInput';
import { CalcTrace } from '../components/CalcTrace';
import { NutrientTable } from '../components/NutrientTable';
import { MethodCompare } from '../components/MethodCompare';
import { AddIngredientScreen } from './AddIngredientScreen';

const HIGHLIGHT: NutrientKey[] = ['potassium', 'iron', 'magnesium'];

/** Sentinel option value for "this ingredient isn't in the list — let me add it". */
const ADD_NEW = '__add_new__';

export function CalcScreen({ profile, today = new Date() }: { profile: Profile | null; today?: Date }) {
  const { catalogue, refresh } = useCatalogue();
  const [ingredientId, setIngredientId] = useState('');
  const [weight, setWeight] = useState<Grams>(g(0));
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [entered, setEntered] = useState<'raw' | 'cooked'>('raw');
  const [method, setMethod] = useState<CookMethod>('roasted');
  const [addingIngredient, setAddingIngredient] = useState(false);

  const ingredient = catalogue.find((i) => i.id === ingredientId) ?? null;

  const handleIngredientChange = (value: string) => {
    if (value === ADD_NEW) {
      setAddingIngredient(true);
      return;
    }
    setIngredientId(value);
  };

  const handleIngredientAdded = async (added: Ingredient) => {
    // The ingredient is already persisted (AddIngredientScreen saved it before calling us);
    // refresh() re-merges the catalogue from storage so it shows up, then we select it so
    // the user lands back on the calculator with their ingredient chosen — never dead-ended.
    await refresh();
    setIngredientId(added.id);
    setAddingIngredient(false);
  };

  const result = useMemo(() => {
    if (ingredient === null || weight <= 0) return null;
    const rawG = entered === 'raw'
      ? weight
      : rawFromCooked(ingredient, weight, method, [], CATEGORY_YIELD).rawWeightG;
    const cooked = computeCooked({
      ingredient, rawG, method, samples: [], categoryYield: CATEGORY_YIELD, retention: RETENTION,
    });
    return { cooked, shownWeight: entered === 'raw' ? cooked.cookedWeightG : rawG };
  }, [ingredient, weight, entered, method]);

  const rows = useMemo(
    () => (ingredient === null ? [] : compareMethods(ingredient, [], CATEGORY_YIELD, RETENTION, HIGHLIGHT)),
    [ingredient],
  );

  const targets = useMemo(
    () => (profile === null ? {} : microTargets(profile, today, rniFor, DV_US)),
    [profile, today],
  );

  return (
    <section>
      <h2>Calculator</h2>

      {addingIngredient ? (
        <AddIngredientScreen initialName="" onSaved={(added) => { void handleIngredientAdded(added); }} />
      ) : (
        <>
          <label htmlFor="ingredient">Ingredient</label>
          <select
            id="ingredient"
            value={ingredientId}
            onChange={(e) => handleIngredientChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {catalogue.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            <option value={ADD_NEW}>Ingredient not listed? Add it</option>
          </select>

          <WeightInput label="Weight" value={weight} unit={unit} onChange={setWeight} onUnitChange={setUnit} />

          <fieldset>
            <legend>This weight is</legend>
            {(['raw', 'cooked'] as const).map((s) => (
              <label key={s}>
                <input type="radio" name="entered" value={s} checked={entered === s} onChange={() => setEntered(s)} />
                {s}
              </label>
            ))}
          </fieldset>

          <label htmlFor="method">Cooking method</label>
          <select id="method" value={method} onChange={(e) => setMethod(e.target.value as CookMethod)}>
            {COOK_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          {result !== null && (
            <>
              <p data-testid="result-weight">
                {result.shownWeight.toLocaleString('en-MY', { maximumFractionDigits: 0 })}g{' '}
                {entered === 'raw' ? 'cooked' : 'raw'}
              </p>

              <CalcTrace steps={result.cooked.steps} />

              <NutrientTable
                totals={result.cooked.totals}
                targets={targets}
                assumedRetentionFor={result.cooked.assumedRetentionFor}
              />

              {profile !== null && (
                <p data-testid="calorie-share">
                  {Math.round((result.cooked.totals.kcal / calorieTarget(profile, today)) * 100)}% of your daily
                  calories · {Math.round((result.cooked.totals.protein / proteinTargetG(profile)) * 100)}% of your protein
                </p>
              )}

              <MethodCompare rows={rows} highlight={HIGHLIGHT} />
            </>
          )}
        </>
      )}
    </section>
  );
}
