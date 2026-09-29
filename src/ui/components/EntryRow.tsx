import { useState } from 'react';
import type { MealEntry } from '../../core/types';
import { entryNutrients, type MealContext } from '../../core/meals';
import { deleteEntry } from '../../storage/meals';
import { entryLabel } from '../labels';

interface Props {
  entry: MealEntry;
  ctx: MealContext;
  onEdit: (entry: MealEntry) => void;
  onDeleted: () => void;
}

export function EntryRow({ entry, ctx, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = entryNutrients(entry, ctx);
  const item = entryLabel(entry, ctx);

  const remove = async () => {
    try {
      await deleteEntry(entry.id);
    } catch (err) {
      console.error('Deleting a meal entry failed', err);
      setConfirming(false);
      setError('Could not remove this — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    setConfirming(false);
    onDeleted();
  };

  return (
    <div className="entry">
      <p className="item-name" data-testid="entry-description">{item.name}</p>
      <p className="item-detail" data-testid="entry-detail">{item.detail}</p>
      <p className="entry__nutrients" data-testid="entry-nutrients">
        {Math.round(n.kcal).toLocaleString('en-MY')} kcal · {Math.round(n.protein)}g protein
      </p>

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement —
              plain text, so role="alert" stays free to mean "a write failed"
              (execution record §3.5). */}
          <p>Remove this from the day? The food goes back to what is left of the cook.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, remove it
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setError(null); setConfirming(false); }}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(entry)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setError(null); setConfirming(true); }}
          >
            Delete
          </button>
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
