import { useState } from 'react';
import { CATEGORIES, NOT_COOKED, NUTRIENT_KEYS, type Category, type Ingredient, type NutrientKey, type NutrientProfile } from '../../core/types';
import { zeroNutrients } from '../../core/nutrients';
import { parseLabel, type LabelReading } from '../../core/labelParse';
import { saveUserIngredient } from '../../storage/userIngredients';
import { newId } from '../newId';

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

export function AddIngredientScreen({
  initialName, onSaved, onCancel,
}: { initialName: string; onSaved: (i: Ingredient) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<Category>('other');
  const [absorbsWater, setAbsorbsWater] = useState(false);
  const [eatenAsIs, setEatenAsIs] = useState(false);
  /** Fields filled from a label and not yet touched: highlighted so each gets checked. */
  const [fromLabel, setFromLabel] = useState<ReadonlySet<NutrientKey>>(new Set());
  const [entries, setEntries] = useState<Entries>(emptyEntries);
  const [error, setError] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');
  const [reading, setReading] = useState<LabelReading | null>(null);

  // Replaces every nutrient field, so pasting a second label never leaves values
  // from the first behind. Nothing is saved: the person checks the form first.
  const fillFromLabel = () => {
    const r = parseLabel(labelText);
    setReading(r);
    if (Object.keys(r.values).length === 0) return;
    const next = emptyEntries();
    for (const k of NUTRIENT_KEYS) {
      const v = r.values[k];
      if (v !== undefined) next[k] = String(v);
    }
    setEntries(next);
    setFromLabel(new Set(NUTRIENT_KEYS.filter((k) => r.values[k] !== undefined)));
    // Packaged food with a label is nearly always eaten as it comes.
    setEatenAsIs(true);
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
    for (const k of NUTRIENT_KEYS) {
      const raw = entries[k].trim();
      if (raw === '') continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) { setError(`${LABELS[k]} must be a number`); return; }
      if (value < 0) { setError(`${LABELS[k]} cannot be negative`); return; }
      per100gRaw[k] = value;
    }

    setError(null);
    const ingredient: Ingredient = {
      id: newId(),
      name: name.trim(),
      category,
      per100gRaw,
      publishedYield: {},
      absorbsWater,
      ...(eatenAsIs ? { defaultMethod: NOT_COOKED } : {}),
      source: 'user',
      ...(filled.length > 0 ? { sourceRef: 'Nutrition label' } : {}),
      archived: false,
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
      <h2>Add an ingredient</h2>
      <p className="screen__hint">Values per 100g raw. Anything you leave blank is recorded as zero.</p>

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
                  <p>Not on the label, so left blank (saved as zero): {missing.map((k) => LABELS[k].replace(/ \(.*\)$/, '')).join(', ')}.</p>
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
            {fromLabel.has(k) && <span className="from-label-tag"> from label</span>}
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
        <button type="button" className="btn btn--primary" onClick={() => void submit()}>Save ingredient</button>
        {onCancel !== undefined && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </section>
  );
}
