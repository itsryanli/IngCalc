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
        {/* "+ Add" visibly, per spec section 6's mockup: the full phrase is what
            forced this button to 264px beside its own heading, and LogScreen
            already offers a full-width "Add something". The aria-label keeps
            the unambiguous name for anyone who hears the button out of
            context. */}
        <button
          type="button"
          className="btn btn--secondary btn--small"
          aria-label={`Add to ${MEAL_LABELS[label].toLowerCase()}`}
          onClick={onAdd}
        >
          + Add
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
