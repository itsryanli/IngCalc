import { useId, useMemo, useState } from 'react';
import { dishFigures } from '../../core/dish';
import { NOT_COOKED, type Ingredient, type Recipe } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { replaceUserIngredient, saveUserIngredient } from '../../storage/userIngredients';
import { AddIngredientScreen } from '../screens/AddIngredientScreen';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

interface Row {
  key: string;
  ingredientId: string;
  grams: Grams;
  unit: WeightUnit;
}

const emptyRow = (): Row => ({ key: newId(), ingredientId: '', grams: g(0), unit: 'g' });

/** 'edit' fixes a mistake in place; 'again' records a new bake as a new version. */
export type DishMode = 'new' | 'edit' | 'again';

interface Props {
  mode: DishMode;
  /** The dish being edited or made again. */
  dish?: Ingredient;
  /** For choosing ingredients: archived ones left out. */
  catalogue: readonly Ingredient[];
  /** For looking up ingredients already in a recipe, archived ones included. */
  all: readonly Ingredient[];
  recentIds?: readonly string[];
  onSaved: (dish: Ingredient) => void;
  onCancel: () => void;
  /** Called after an ingredient is added mid-recipe, so the catalogue can be re-read. */
  onCatalogueChanged: () => void;
}

const round = (n: number, places = 1) => n.toLocaleString('en-MY', { maximumFractionDigits: places });

/**
 * A dish made from other ingredients, e.g. a loaf of seeded bread: what went in,
 * raw, and what the finished dish weighed. It is saved as one of the person's
 * own ingredients, eaten as it is, so slices are logged like anything else.
 */
export function DishForm({
  mode, dish, catalogue, all, recentIds = [], onSaved, onCancel, onCatalogueChanged,
}: Props) {
  const ids = useId();
  const [name, setName] = useState(dish?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() => (dish?.recipe === undefined
    ? [emptyRow(), emptyRow()]
    : dish.recipe.items.map((i) => ({ key: newId(), ingredientId: i.ingredientId, grams: i.grams, unit: 'g' as const }))));
  // A new bake weighs something new, so "made again" asks for it afresh.
  const [finishedG, setFinishedG] = useState<Grams>(mode === 'edit' && dish?.recipe !== undefined ? dish.recipe.finishedWeightG : g(0));
  const [finishedUnit, setFinishedUnit] = useState<WeightUnit>('g');
  const [adding, setAdding] = useState<{ key: string; typedName: string } | null>(null);
  // Ingredients added mid-recipe, usable before the catalogue has been re-read.
  const [added, setAdded] = useState<Ingredient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const lookup = useMemo(() => {
    const byId = new Map([...all, ...added].map((i) => [i.id, i]));
    return (id: string) => byId.get(id);
  }, [all, added]);
  // A dish cannot be one of its own ingredients.
  const choosable = useMemo(
    () => [...catalogue, ...added.filter((a) => !catalogue.some((c) => c.id === a.id))]
      .filter((i) => i.id !== dish?.id),
    [catalogue, added, dish],
  );

  const recipe: Recipe = { items: rows.map((r) => ({ ingredientId: r.ingredientId, grams: r.grams })), finishedWeightG: finishedG };
  const started = rows.some((r) => r.ingredientId !== '' || r.grams > 0) && finishedG > 0;
  const check = dishFigures(recipe, lookup);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (name.trim() === '') { setError('Give the dish a name.'); return; }
    // Rows left completely empty are ignored rather than refused.
    const used: Recipe = { ...recipe, items: recipe.items.filter((i) => i.ingredientId !== '' || i.grams > 0) };
    const result = dishFigures(used, lookup);
    if (!result.ok) { setError(result.message); return; }
    setError(null);

    const { per100g, unknownNutrients, partialNutrients } = result.figures;
    const saved: Ingredient = {
      id: mode === 'edit' && dish !== undefined ? dish.id : newId(),
      name: name.trim(),
      category: dish?.category ?? 'other',
      per100gRaw: per100g,
      publishedYield: {},
      absorbsWater: false,
      defaultMethod: NOT_COOKED,
      ...(unknownNutrients.length === 0 ? {} : { unknownNutrients }),
      ...(partialNutrients.length === 0 ? {} : { partialNutrients }),
      recipe: used,
      source: 'user',
      sourceRef: 'Your recipe',
      archived: false,
    };
    try {
      if (mode === 'again' && dish !== undefined) await replaceUserIngredient(saved, dish.id);
      else await saveUserIngredient(saved);
    } catch (err) {
      console.error('Saving a dish failed', err);
      setError('Could not save this dish — storage may be blocked or full. Please try again.');
      return;
    }
    onSaved(saved);
  };

  if (adding !== null) {
    return (
      <AddIngredientScreen
        initialName={adding.typedName}
        onSaved={(ingredient) => {
          setAdded((list) => [...list, ingredient]);
          onCatalogueChanged();
          update(adding.key, { ingredientId: ingredient.id });
          setAdding(null);
        }}
        onCancel={() => setAdding(null)}
      />
    );
  }

  const heading = mode === 'new' ? 'Make a dish' : mode === 'again' ? `Made ${dish?.name ?? 'this'} again` : `Edit ${dish?.name ?? 'dish'}`;

  return (
    <div className="screen dish-form">
      <h3>{heading}</h3>
      <p className="screen__hint">
        List what went in, raw. Leave out water: weighing the finished dish takes care of it.
        {mode === 'again' && ' Change anything you did differently this time.'}
        {mode === 'edit' && ' Changes apply everywhere this dish is used, including meals already logged.'}
      </p>

      <div className="field">
        <label htmlFor={`${ids}-name`}>Dish name</label>
        <input id={`${ids}-name`} type="text" value={name} placeholder="e.g. Seeded wholewheat bread"
               onChange={(e) => setName(e.target.value)} />
      </div>

      <ol className="dish-form__items">
        {rows.map((row, i) => (
          <li key={row.key} className="dish-form__item" data-testid={`dish-item-${i + 1}`}>
            <div className="trip-item__head">
              <p className="trip-item__label">Ingredient {i + 1}</p>
              {rows.length > 1 && (
                <button type="button" className="btn btn--secondary btn--small" aria-label={`Remove ingredient ${i + 1}`}
                        onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}>
                  Remove
                </button>
              )}
            </div>
            <IngredientPicker
              catalogue={choosable}
              recentIds={recentIds}
              value={row.ingredientId}
              onChange={(ingredientId) => update(row.key, { ingredientId })}
              onAddNew={(typedName) => setAdding({ key: row.key, typedName })}
            />
            <WeightInput label="How much went in" value={row.grams} unit={row.unit}
                         onChange={(grams) => update(row.key, { grams })}
                         onUnitChange={(unit) => update(row.key, { unit })} />
          </li>
        ))}
      </ol>

      <button type="button" className="btn btn--secondary dish-form__add" onClick={() => setRows((list) => [...list, emptyRow()])}>
        Add another ingredient
      </button>

      <WeightInput label="Finished weight (weigh the whole dish)" value={finishedG} unit={finishedUnit}
                   onChange={setFinishedG} onUnitChange={setFinishedUnit} />

      {started && check.ok && (
        <div className="card dish-form__preview" role="status">
          <p className="dish-form__per100">
            Per 100 g: <strong>{round(check.figures.per100g.kcal, 0)} kcal</strong> ·{' '}
            {round(check.figures.per100g.protein)} g protein · {round(check.figures.per100g.carbs)} g carbohydrate ·{' '}
            {round(check.figures.per100g.fat)} g fat
          </p>
          <p className="screen__hint">
            The ingredients listed weigh {round(check.figures.inputWeightG, 0)} g; the dish weighs {round(finishedG, 0)} g.
            {finishedG > check.figures.inputWeightG && ' It weighs more than what is listed, which is right if water went in.'}
          </p>
          {check.figures.partialNutrients.length > 0 && (
            <p className="screen__hint">
              Shown as &ldquo;at least&rdquo;, because some ingredients have no figure:{' '}
              {check.figures.partialNutrients.join(', ')}.
            </p>
          )}
          {check.figures.unknownNutrients.length > 0 && (
            <p className="screen__hint">
              Not known for this dish, because no ingredient has a figure:{' '}
              {check.figures.unknownNutrients.join(', ')}.
            </p>
          )}
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void submit(); }}>
          {mode === 'edit' ? 'Save changes' : 'Save dish'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
