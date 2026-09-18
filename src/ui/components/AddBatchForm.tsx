import { useState } from 'react';
import { validateRawWeightEdit } from '../../core/batch';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { g, myr, type Grams } from '../../core/units';
import { saveBatch } from '../../storage/kitchen';
import { todayIso } from '../dates';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

interface Props {
  catalogue: readonly Ingredient[];
  /** Present when editing; absent when creating. */
  batch?: Batch;
  /** Required when editing, to guard a reduced purchase weight. */
  sessions?: readonly CookSession[];
  initialIngredientId?: string;
  initialRawWeightG?: Grams;
  /** Injected so the default date is testable, as in Phase 1's CalcScreen. */
  today?: Date;
  onSaved: (batch: Batch) => void;
  onCancel: () => void;
  onAddNew: (typedName: string) => void;
}

export function AddBatchForm({
  catalogue, batch, sessions = [], initialIngredientId, initialRawWeightG,
  today = new Date(), onSaved, onCancel, onAddNew,
}: Props) {
  const editing = batch !== undefined;

  const [ingredientId, setIngredientId] = useState(
    batch?.ingredientId ?? initialIngredientId ?? '',
  );
  const [rawWeightG, setRawWeightG] = useState<Grams>(
    batch?.rawWeightG ?? initialRawWeightG ?? g(0),
  );
  const [unit, setUnit] = useState<WeightUnit>('g');
  const [priceText, setPriceText] = useState(
    batch === undefined ? '' : `${batch.purchase.pricePaidMYR}`,
  );
  const [location, setLocation] = useState(batch?.purchase.location ?? '');
  const [date, setDate] = useState(batch?.purchase.date ?? todayIso(today));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (ingredientId === '') { setError('Pick an ingredient first.'); return; }
    if (rawWeightG <= 0) { setError('Weigh the raw ingredient and enter it.'); return; }

    // Blank means "not recorded", which is a real answer for a gift or a
    // forgotten receipt. Anything non-blank has to be a number.
    const trimmed = priceText.trim();
    const price = trimmed === '' ? 0 : Number(trimmed);
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter the price paid as a number, or leave it blank.');
      return;
    }

    if (date.trim() === '') { setError('Enter the date you bought this.'); return; }

    if (editing) {
      const check = validateRawWeightEdit(batch, sessions, rawWeightG);
      if (!check.ok) { setError(check.message); return; }
    }

    setError(null);
    const saved: Batch = {
      // The same id on an edit is what keeps this batch's cook sessions attached.
      id: batch?.id ?? newId(),
      ingredientId,
      rawWeightG,
      purchase: { pricePaidMYR: myr(price), location: location.trim(), date },
      createdAt: batch?.createdAt ?? Date.now(),
    };

    await saveBatch(saved);
    onSaved(saved);
  };

  return (
    <div className="screen">
      <h3>{editing ? 'Edit this batch' : 'Log a purchase'}</h3>

      <IngredientPicker
        catalogue={catalogue}
        value={ingredientId}
        onChange={setIngredientId}
        onAddNew={onAddNew}
      />

      <WeightInput
        label="Raw weight"
        value={rawWeightG}
        unit={unit}
        onChange={setRawWeightG}
        onUnitChange={setUnit}
      />

      <div className="field">
        <label htmlFor="batch-price">Price paid (RM)</label>
        <input
          id="batch-price"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="batch-location">Where from</label>
        <input
          id="batch-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="batch-date">Date bought</label>
        <input
          id="batch-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {error !== null && <p role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void submit(); }}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
