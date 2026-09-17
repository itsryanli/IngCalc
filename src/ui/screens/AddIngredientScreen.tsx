import { useState } from 'react';
import { CATEGORIES, NUTRIENT_KEYS, type Category, type Ingredient, type NutrientKey, type NutrientProfile } from '../../core/types';
import { zeroNutrients } from '../../core/nutrients';
import { saveUserIngredient } from '../../storage/userIngredients';
import { newId } from '../newId';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy (kcal)', protein: 'Protein (g)', carbs: 'Carbohydrate (g)',
  fibre: 'Fibre (g)', fat: 'Fat (g)', potassium: 'Potassium (mg)',
  iron: 'Iron (mg)', magnesium: 'Magnesium (mg)', zinc: 'Zinc (mg)',
  calcium: 'Calcium (mg)', sodium: 'Sodium (mg)',
};

type Entries = Record<NutrientKey, string>;

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
  const [entries, setEntries] = useState<Entries>(emptyEntries);
  const [error, setError] = useState<string | null>(null);

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
      source: 'user',
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
    <section>
      <h2>Add an ingredient</h2>
      <p>Values per 100g raw. Anything you leave blank is recorded as zero.</p>

      <label htmlFor="ing-name">Name</label>
      <input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="ing-category">Category</label>
      <select id="ing-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label>
        <input type="checkbox" checked={absorbsWater} onChange={(e) => setAbsorbsWater(e.target.checked)} />
        Absorbs water when cooked (rice, pasta, dried beans)
      </label>

      {NUTRIENT_KEYS.map((k) => (
        <div key={k}>
          <label htmlFor={`n-${k}`}>{LABELS[k]}</label>
          {/* type="text" with inputMode="decimal" allows validation to catch non-numeric input that
              type="number" would sanitise away, rendering the Number.isFinite guard reachable.
              inputMode preserves the numeric keypad on mobile devices. */}
          <input
            id={`n-${k}`}
            type="text"
            inputMode="decimal"
            value={entries[k]}
            onChange={(e) => setEntries((s) => ({ ...s, [k]: e.target.value }))}
          />
        </div>
      ))}

      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void submit()}>Save ingredient</button>
      {onCancel !== undefined && (
        <button type="button" onClick={onCancel}>Cancel</button>
      )}
    </section>
  );
}
