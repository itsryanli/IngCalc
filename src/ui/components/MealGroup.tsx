import { dayTotals, type MealContext } from '../../core/meals';
import type { MealEntry, MealLabel } from '../../core/types';
import { MEAL_LABELS } from '../labels';
import { EntryRow } from './EntryRow';

interface Props {
  label: MealLabel;
  entries: readonly MealEntry[];
  ctx: MealContext;
  onAdd: () => void;
  onEdit: (entry: MealEntry) => void;
  onChanged: () => void;
}

export function MealGroup({ label, entries, ctx, onAdd, onEdit, onChanged }: Props) {
  // Reuses dayTotals rather than summing here: a meal is a day in miniature,
  // and two summing implementations would eventually disagree.
  const subtotal = entries.length === 0 ? null : dayTotals(entries, ctx).totals;

  return (
    <section className="meal-group">
      <div className="meal-group__head">
        <h3>{MEAL_LABELS[label]}</h3>
        <button type="button" className="btn btn--secondary btn--small" onClick={onAdd}>
          Add to {MEAL_LABELS[label].toLowerCase()}
        </button>
      </div>

      {subtotal !== null && (
        <p className="meal-group__subtotal" data-testid={`group-subtotal-${label}`}>
          {Math.round(subtotal.kcal).toLocaleString('en-MY')} kcal ·{' '}
          {Math.round(subtotal.protein)}g protein
        </p>
      )}

      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} ctx={ctx} onEdit={onEdit} onDeleted={onChanged} />
      ))}
    </section>
  );
}
