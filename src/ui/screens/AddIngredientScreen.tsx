import { useState } from 'react';
import { CATEGORIES, NOT_COOKED, NUTRIENT_KEYS, type Category, type Ingredient, type NutrientKey, type NutrientProfile } from '../../core/types';
import { zeroNutrients } from '../../core/nutrients';
import { parseLabel, type LabelReading } from '../../core/labelParse';
import { saveUserIngredient } from '../../storage/userIngredients';
import { newId } from '../newId';
import { OnlineSearch } from '../components/OnlineSearch';
import type { OffFood } from '../../core/openFoodFacts';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy (kcal)', protein: 'Protein (g)', carbs: 'Carbohydrate (g)',
  fibre: 'Fibre (g)', fat: 'Fat (g)', potassium: 'Potassium (mg)',
  iron: 'Iron (mg)', magnesium: 'Magnesium (mg)', zinc: 'Zinc (mg)',
  calcium: 'Calcium (mg)', sodium: 'Sodium (mg)',
};

type Entries = Record<NutrientKey, string>;

const BASIS: Record<LabelReading['basis'], string> = {
  per100g: 'from the per 100 g column',
  per100ml: 'from the per 100 ml column',
  perServing: 'converted from per serving to per 100 g',
  assumedPer100g: 'as per 100 g',
};

const emptyEntries = (): Entries => {
  const out = {} as Entries;
  for (const k of NUTRIENT_KEYS) out[k] = '';
  return out;
};

/** The stored values as form text, so editing starts from what was saved; unknown ones blank. */
const entriesFrom = (i: Ingredient): Entries => {
  const out = {} as Entries;
  for (const k of NUTRIENT_KEYS) out[k] = i.unknownNutrients?.includes(k) ? '' : String(i.per100gRaw[k]);
  return out;
};

export function AddIngredientScreen({
  initialName = '', searchFor, editing, onSaved, onCancel,
}: {
  initialName?: string;
  /** Open on an online search for this name: "Search online for …" in a picker. */
  searchFor?: string;
  /** One of the person's own ingredients, to change rather than add. */
  editing?: Ingredient;
  onSaved: (i: Ingredient) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? initialName);
  const [category, setCategory] = useState<Category>(editing?.category ?? 'other');
  const [absorbsWater, setAbsorbsWater] = useState(editing?.absorbsWater ?? false);
  const [eatenAsIs, setEatenAsIs] = useState(editing?.defaultMethod === NOT_COOKED);
  /** Fields filled from a label and not yet touched: highlighted so each gets checked. */
  const [fromLabel, setFromLabel] = useState<ReadonlySet<NutrientKey>>(new Set());
  const [entries, setEntries] = useState<Entries>(() => (editing === undefined ? emptyEntries() : entriesFrom(editing)));
  const [error, setError] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');
  const [reading, setReading] = useState<LabelReading | null>(null);
  /** Where the highlighted values came from, which sets their tag and the saved source. */
  const [fillSource, setFillSource] = useState<'label' | 'online' | null>(null);
  const [picked, setPicked] = useState<OffFood | null>(null);

  const fillFrom = (values: Partial<Record<NutrientKey, number>>) => {
    const next = emptyEntries();
    for (const k of NUTRIENT_KEYS) {
      const v = values[k];
      if (v !== undefined) next[k] = String(v);
    }
    setEntries(next);
    setFromLabel(new Set(NUTRIENT_KEYS.filter((k) => values[k] !== undefined)));
    // Packaged food is nearly always eaten as it comes.
    setEatenAsIs(true);
  };

  const pickOnline = (food: OffFood) => {
    fillFrom(food.values);
    setName(food.brand !== '' && !food.name.toLowerCase().includes(food.brand.toLowerCase())
      ? `${food.name} (${food.brand})` : food.name);
    setPicked(food);
    setFillSource('online');
  };

  // Replaces every nutrient field, so pasting a second label never leaves values
  // from the first behind. Nothing is saved: the person checks the form first.
  const fillFromLabel = () => {
    const r = parseLabel(labelText);
    setReading(r);
    if (Object.keys(r.values).length === 0) return;
    fillFrom(r.values);
    setFillSource('label');
  };

  const changeNutrient = (k: NutrientKey, value: string) => {
    setEntries((s) => ({ ...s, [k]: value }));
    setFromLabel((s) => {
      if (!s.has(k)) return s;
      const next = new Set(s);
      next.delete(k);
      return next;
    });
  };

  const filled = reading === null ? [] : NUTRIENT_KEYS.filter((k) => reading.values[k] !== undefined);
  const missing = reading === null ? [] : NUTRIENT_KEYS.filter((k) => reading.values[k] === undefined);

  const submit = async () => {
    if (name.trim() === '') { setError('Please enter a name'); return; }

    const per100gRaw: NutrientProfile = zeroNutrients();
    // A blank is "not known", not zero: kept as 0 for the sums, and listed so
    // the app can say so instead of showing a false 0.
    const unknownNutrients: NutrientKey[] = [];
    for (const k of NUTRIENT_KEYS) {
      const raw = entries[k].trim();
      if (raw === '') { unknownNutrients.push(k); continue; }
      const value = Number(raw);
      if (!Number.isFinite(value)) { setError(`${LABELS[k]} must be a number`); return; }
      if (value < 0) { setError(`${LABELS[k]} cannot be negative`); return; }
      per100gRaw[k] = value;
    }

    setError(null);
    // An edit keeps the id, so every batch and meal that uses it sees the change.
    const sourceRef = fillSource === 'online' && picked !== null
      ? `Open Food Facts ${picked.code}`
      : fillSource === 'label' ? 'Nutrition label' : editing?.sourceRef;
    const defaultMethod = eatenAsIs
      ? NOT_COOKED
      : editing?.defaultMethod === NOT_COOKED ? undefined : editing?.defaultMethod;
    const ingredient: Ingredient = {
      id: editing?.id ?? newId(),
      name: name.trim(),
      category,
      per100gRaw,
      publishedYield: editing?.publishedYield ?? {},
      absorbsWater,
      ...(defaultMethod === undefined ? {} : { defaultMethod }),
      ...(unknownNutrients.length === 0 ? {} : { unknownNutrients }),
      source: 'user',
      ...(sourceRef === undefined ? {} : { sourceRef }),
      archived: editing?.archived ?? false,
    };
    try {
      await saveUserIngredient(ingredient);
    } catch {
      // Dexie can reject (private browsing, quota, a blocked upgrade) — without this the
      // promise rejection would be unhandled, onSaved would never fire, and the user would
      // tap Save to nothing: no error, no navigation, form unchanged.
      setError('Could not save this ingredient — your browser may be blocking storage (for example, private browsing) or storage may be full. Please try again.');
      return;
    }
    onSaved(ingredient);
  };

  return (
    <section className="screen">
      <h2>{editing === undefined ? 'Add an ingredient' : `Edit ${editing.name}`}</h2>
      <p className="screen__hint">
        Values per 100g raw. Leave a value blank if you don't know it (type 0 only if it really is zero).
        {editing !== undefined && ' Changes apply everywhere this ingredient is used, including meals already logged.'}
      </p>

      {editing === undefined && (
        <OnlineSearch initialQuery={searchFor ?? initialName} autoSearch={searchFor !== undefined} onPick={pickOnline} />
      )}
      {fillSource === 'online' && picked !== null && (
        <div role="status" className="banner banner--info label-paste__result">
          <p>
            Filled in {Object.keys(picked.values).length} values for {picked.name} from Open Food Facts
            {picked.perMl && ' (per 100 ml, used as per 100 g)'}. They're highlighted below: anyone can
            edit Open Food Facts, so check them against the pack if you have it.
          </p>
          {NUTRIENT_KEYS.some((k) => picked.values[k] === undefined) && (
            <p>Not listed, so left blank and saved as not known: {NUTRIENT_KEYS.filter((k) => picked.values[k] === undefined).map((k) => LABELS[k].replace(/ \(.*\)$/, '')).join(', ')}.</p>
          )}
        </div>
      )}

      <details className="label-paste">
        <summary>Fill in from a nutrition label</summary>
        <p className="screen__hint">
          On iPhone, tap and hold in the box below and choose Scan Text, then point the
          camera at the label. Or copy the label's text from the camera or a photo (Live
          Text on iPhone, Google Lens on Android) and paste it here.
        </p>
        <div className="field">
          <label htmlFor="label-text">Label text</label>
          <textarea id="label-text" rows={6} value={labelText} onChange={(e) => setLabelText(e.target.value)} />
        </div>
        <button type="button" className="btn btn--secondary" disabled={labelText.trim() === ''} onClick={fillFromLabel}>
          Fill in values
        </button>
        {reading !== null && (
          <div role="status" className={`banner ${filled.length === 0 || reading.notes.length > 0 ? 'banner--warn' : 'banner--info'} label-paste__result`}>
            {filled.length === 0 ? (
              <p>No nutrition values were found in that text. Check it's the nutrition table, or type the values in below.</p>
            ) : (
              <>
                <p>
                  Filled in {filled.length} {filled.length === 1 ? 'value' : 'values'} {BASIS[reading.basis]}
                  {reading.servingGrams !== undefined && ` (serving: ${reading.servingGrams} g)`}.
                  They're highlighted below: check each one against the label before saving.
                </p>
                {missing.length > 0 && (
                  <p>Not on the label, so left blank and saved as not known: {missing.map((k) => LABELS[k].replace(/ \(.*\)$/, '')).join(', ')}.</p>
                )}
              </>
            )}
            {reading.notes.length > 0 && <ul>{reading.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        )}
      </details>

      <div className="field">
        <label htmlFor="ing-name">Name</label>
        <input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="ing-category">Category</label>
        <select id="ing-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={absorbsWater} onChange={(e) => setAbsorbsWater(e.target.checked)} />
        Absorbs water when cooked (rice, pasta, dried beans)
      </label>

      <label className="checkbox-row">
        <input type="checkbox" checked={eatenAsIs} onChange={(e) => setEatenAsIs(e.target.checked)} />
        Usually eaten without cooking (bread, crackers, yogurt, fruit)
      </label>

      <fieldset>
        <legend>Nutrients per 100g raw</legend>
        <div className="nutrient-grid">
      {NUTRIENT_KEYS.map((k) => (
        <div key={k} className={`field${fromLabel.has(k) ? ' field--from-label' : ''}`}>
          <label htmlFor={`n-${k}`}>
            {LABELS[k]}
            {fromLabel.has(k) && <span className="from-label-tag"> {fillSource === 'online' ? 'from search' : 'from label'}</span>}
          </label>
          {/* type="text" with inputMode="decimal" allows validation to catch non-numeric input that
              type="number" would sanitise away, rendering the Number.isFinite guard reachable.
              inputMode preserves the numeric keypad on mobile devices. */}
          <input
            id={`n-${k}`}
            type="text"
            inputMode="decimal"
            value={entries[k]}
            onChange={(e) => changeNutrient(k, e.target.value)}
          />
        </div>
      ))}
        </div>
      </fieldset>

      {error !== null && <p role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => void submit()}>{editing === undefined ? 'Save ingredient' : 'Save changes'}</button>
        {onCancel !== undefined && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </section>
  );
}
