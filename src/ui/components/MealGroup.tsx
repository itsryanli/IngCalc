import { dayTotals, type MealContext } from '../../core/meals';
import type { MealEntry, MealLabel } from '../../core/types';
import { MEAL_LABELS } from '../labels';
import { EntryRow } from './EntryRow';

/** A glanceable marker per meal, so the four sections are told apart by shape, not just by reading. */
const MEAL_ICONS: Record<MealLabel, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎',
};

interface Props {
  label: MealLabel;
  entries: readonly MealEntry[];
  ctx: MealContext;
  onAdd: () => void;
  onEdit: (entry: MealEntry) => void;
  onChanged: () => void;
  /** Offered on an empty meal when this meal was logged on an earlier day. */
  repeat?: { from: string; count: number; onRepeat: () => void };
}

export function MealGroup({ label, entries, ctx, onAdd, onEdit, onChanged, repeat }: Props) {
  // Reuses dayTotals rather than summing here: a meal is a day in miniature,
  // and two summing implementations would eventually disagree.
  const subtotal = entries.length === 0 ? null : dayTotals(entries, ctx).totals;

  return (
    <section className="card meal-group" aria-labelledby={`meal-${label}`}>
      <div className="meal-group__head">
        <span className="meal-group__icon" aria-hidden="true">{MEAL_ICONS[label]}</span>
        <div className="meal-group__title">
          <h3 id={`meal-${label}`}>{MEAL_LABELS[label]}</h3>
          {subtotal !== null && (
            <p className="meal-group__subtotal" data-testid={`group-subtotal-${label}`}>
              {Math.round(subtotal.kcal).toLocaleString('en-MY')} kcal ·{' '}
              {Math.round(subtotal.protein)}g protein
            </p>
          )}
        </div>
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

      {entries.length === 0 && <p className="meal-group__empty">Nothing logged yet</p>}
      {entries.length === 0 && repeat !== undefined && (
        <button type="button" className="btn btn--secondary btn--small meal-group__repeat" onClick={repeat.onRepeat}>
          Same as {repeat.from} ({repeat.count} {repeat.count === 1 ? 'item' : 'items'})
        </button>
      )}

      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} ctx={ctx} onEdit={onEdit} onDeleted={onChanged} />
      ))}
    </section>
  );
}
