import { useState } from 'react';
import type { Ingredient } from '../../core/types';
import { archiveUserIngredient, restoreUserIngredient } from '../../storage/userIngredients';

/**
 * The ingredients the person added themselves, to fix (a misread label) or put
 * away. Archiving only hides one from the pickers: past meals and batches keep
 * using it, and it can be brought back, so it needs no confirmation.
 */
export function MyIngredients({ ingredients, onEdit, onMakeAgain, onChanged }: {
  /** The person's own ingredients, archived ones included. */
  ingredients: readonly Ingredient[];
  onEdit: (ingredient: Ingredient) => void;
  /** For a dish: record a new bake, saved as a new version. */
  onMakeAgain?: (dish: Ingredient) => void;
  onChanged: () => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = ingredients.filter((i) => !i.archived);
  const archived = ingredients.filter((i) => i.archived);
  if (ingredients.length === 0) return null;

  const run = async (change: () => Promise<void>) => {
    try {
      await change();
      setError(null);
      onChanged();
    } catch (err) {
      console.error('Changing an ingredient failed', err);
      setError('Could not change this ingredient — storage may be blocked or full. Please try again.');
    }
  };

  return (
    <div className="card my-ingredients">
      <h3 className="card__title">My ingredients</h3>
      {active.length === 0 && <p className="screen__hint">All your ingredients are archived.</p>}
      <ul className="my-ingredients__list">
        {active.map((i) => (
          <li key={i.id} className="my-ingredients__row">
            <span className="my-ingredients__name">
              {i.name}
              {i.recipe !== undefined && <span className="my-ingredients__kind">dish</span>}
            </span>
            {i.recipe !== undefined && onMakeAgain !== undefined && (
              <button type="button" className="btn btn--secondary btn--small" aria-label={`Made ${i.name} again`}
                      onClick={() => onMakeAgain(i)}>
                Made again
              </button>
            )}
            <button type="button" className="btn btn--secondary btn--small" aria-label={`Edit ${i.name}`}
                    onClick={() => onEdit(i)}>
              Edit
            </button>
            <button type="button" className="btn btn--secondary btn--small" aria-label={`Archive ${i.name}`}
                    onClick={() => { void run(() => archiveUserIngredient(i.id)); }}>
              Archive
            </button>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
        </button>
      )}
      {showArchived && (
        <ul className="my-ingredients__list">
          {archived.map((i) => (
            <li key={i.id} className="my-ingredients__row my-ingredients__row--archived">
              <span className="my-ingredients__name">{i.name}</span>
              <button type="button" className="btn btn--secondary btn--small" aria-label={`Restore ${i.name}`}
                      onClick={() => { void run(() => restoreUserIngredient(i.id)); }}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
