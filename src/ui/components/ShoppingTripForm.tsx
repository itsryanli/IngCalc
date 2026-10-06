import { useId, useState } from 'react';
import type { Batch, Ingredient } from '../../core/types';
import { formatMYR, g, myr, type Grams } from '../../core/units';
import { saveBatches } from '../../storage/kitchen';
import { AddIngredientScreen } from '../screens/AddIngredientScreen';
import { todayIso } from '../dates';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

interface Item {
  key: string;
  ingredientId: string;
  rawWeightG: Grams;
  unit: WeightUnit;
  priceText: string;
}

const emptyItem = (): Item => ({ key: newId(), ingredientId: '', rawWeightG: g(0), unit: 'g', priceText: '' });

/** Blank means "not recorded" (a gift, a lost receipt); anything else must be a number. */
function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface Props {
  catalogue: readonly Ingredient[];
  /** Recently used ingredient ids, offered first in each item's picker. */
  recentIds?: readonly string[];
  /** Shops already used, offered as suggestions. */
  pastLocations: readonly string[];
  today?: Date;
  onSaved: (batches: Batch[]) => void;
  onCancel: () => void;
  /** Called after an ingredient is added mid-trip, so the catalogue can be re-read. */
  onCatalogueChanged: () => void;
}

/**
 * One shopping trip: the shop and date once, then each thing bought. Every
 * item becomes its own batch (it is weighed, cooked and eaten on its own), but
 * they share a `tripId` so the trip can be read back as one receipt.
 *
 * Adding a new ingredient happens inside this form rather than on a separate
 * screen, so the items already entered are not lost on the way.
 */
export function ShoppingTripForm({
  catalogue, recentIds = [], pastLocations, today = new Date(), onSaved, onCancel, onCatalogueChanged,
}: Props) {
  const ids = useId();
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(todayIso(today));
  const [items, setItems] = useState<Item[]>(() => [emptyItem()]);
  const [adding, setAdding] = useState<{ key: string; typedName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const total = items.reduce((sum, it) => sum + (parsePrice(it.priceText) ?? 0), 0);

  const submit = async () => {
    const many = items.length > 1;
    for (const [i, it] of items.entries()) {
      const which = many ? `Item ${i + 1}: ` : '';
      if (it.ingredientId === '') { setError(`${which}Pick an ingredient first.`); return; }
      if (it.rawWeightG <= 0) { setError(`${which}Weigh the raw ingredient and enter it.`); return; }
      if (parsePrice(it.priceText) === null) {
        setError(`${which}Enter the price paid as a number, or leave it blank.`);
        return;
      }
    }
    if (date.trim() === '') { setError('Enter the date you bought these.'); return; }

    setError(null);
    const tripId = newId();
    const now = Date.now();
    const batches: Batch[] = items.map((it, i) => ({
      id: newId(),
      ingredientId: it.ingredientId,
      rawWeightG: it.rawWeightG,
      purchase: { pricePaidMYR: myr(parsePrice(it.priceText)!), location: location.trim(), date, tripId },
      // Distinct and in entry order, so the Kitchen lists them as they were typed.
      createdAt: now + i,
    }));

    try {
      await saveBatches(batches);
    } catch (err) {
      console.error('Saving a shopping trip failed', err);
      setError(
        'Could not save this purchase — your browser may be blocking storage ' +
        '(for example, private browsing) or storage may be full. Please try again.',
      );
      return;
    }
    onSaved(batches);
  };

  if (adding !== null) {
    return (
      <AddIngredientScreen
        initialName={adding.typedName}
        onSaved={(added) => {
          onCatalogueChanged();
          update(adding.key, { ingredientId: added.id });
          setAdding(null);
        }}
        onCancel={() => setAdding(null)}
      />
    );
  }

  return (
    <div className="screen trip-form">
      <h3>Log a purchase</h3>
      <p className="screen__hint">
        Bought several things in one trip? Add each one below — the shop and date are shared.
      </p>

      <div className="field">
        <label htmlFor={`${ids}-location`}>Where from</label>
        <input
          id={`${ids}-location`}
          type="text"
          list={`${ids}-locations`}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <datalist id={`${ids}-locations`}>
          {pastLocations.map((l) => <option key={l} value={l} />)}
        </datalist>
      </div>

      <div className="field">
        <label htmlFor={`${ids}-date`}>Date bought</label>
        <input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <ol className="trip-items">
        {items.map((it, i) => (
          <TripItem
            key={it.key}
            item={it}
            index={i}
            catalogue={catalogue}
            recentIds={recentIds}
            removable={items.length > 1}
            onChange={(patch) => update(it.key, patch)}
            onRemove={() => setItems((list) => list.filter((x) => x.key !== it.key))}
            onAddNew={(typedName) => setAdding({ key: it.key, typedName })}
          />
        ))}
      </ol>

      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => setItems((list) => [...list, emptyItem()])}
      >
        + Add another item
      </button>

      <p className="trip-total" data-testid="trip-total">
        {items.length} item{items.length === 1 ? '' : 's'} · {formatMYR(myr(total))}
      </p>

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

function TripItem({ item, index, catalogue, recentIds, removable, onChange, onRemove, onAddNew }: {
  item: Item;
  index: number;
  catalogue: readonly Ingredient[];
  recentIds: readonly string[];
  removable: boolean;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  onAddNew: (typedName: string) => void;
}) {
  const priceId = useId();
  return (
    <li className="trip-item" data-testid={`trip-item-${index + 1}`}>
      <div className="trip-item__head">
        <p className="trip-item__label">Item {index + 1}</p>
        {removable && (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            aria-label={`Remove item ${index + 1}`}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>

      <IngredientPicker
        catalogue={catalogue}
        recentIds={recentIds}
        value={item.ingredientId}
        onChange={(ingredientId) => onChange({ ingredientId })}
        onAddNew={onAddNew}
      />

      <WeightInput
        label="Raw weight"
        value={item.rawWeightG}
        unit={item.unit}
        onChange={(rawWeightG) => onChange({ rawWeightG })}
        onUnitChange={(unit) => onChange({ unit })}
      />

      <div className="field">
        <label htmlFor={priceId}>Price paid (RM)</label>
        <input
          id={priceId}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={item.priceText}
          onChange={(e) => onChange({ priceText: e.target.value })}
        />
      </div>
    </li>
  );
}
