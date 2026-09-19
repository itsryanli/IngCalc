import { useState } from 'react';
import { batchState, cookedRemainingG, rawRemainingG, sessionsOf } from '../../core/batch';
import {
  costPerKgCooked, costPerKgRaw, proteinPerMYRRaw, proteinPerMYRRetained,
} from '../../core/cost';
import type { Batch, CookSession, Ingredient, MealEntry } from '../../core/types';
import { formatG, formatMYR, g } from '../../core/units';
import { RETENTION } from '../../data/retentionTable';
import { deleteBatchCascade } from '../../storage/kitchen';
import { formatIsoDate } from '../dates';
import { STATE_LABELS } from '../labels';
import { SessionRow } from './SessionRow';

interface Props {
  batch: Batch;
  /**
   * Null when the ingredient has been archived out of the catalogue. Archiving
   * rather than deleting is what keeps this batch meaningful at all, but the
   * card still has to render without it.
   */
  ingredient: Ingredient | null;
  /** Every session in the kitchen; the card filters to its own. */
  sessions: readonly CookSession[];
  /** Every meal entry in the kitchen; the cooked remainder is derived from them. */
  entries: readonly MealEntry[];
  onChanged: () => void;
  onCook: (batch: Batch) => void;
  onEditBatch: (batch: Batch) => void;
  onEditSession: (batch: Batch, session: CookSession) => void;
}

export function BatchCard({
  batch, ingredient, sessions, entries, onChanged, onCook, onEditBatch, onEditSession,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = sessionsOf(batch.id, sessions);
  const state = batchState(batch, sessions, entries);
  const remaining = rawRemainingG(batch, sessions);
  const cookedLeft = g(mine.reduce((sum, s) => sum + cookedRemainingG(s, entries), 0));

  const perKgRaw = costPerKgRaw(batch);
  const perKgCooked = costPerKgCooked(batch, sessions);
  const proteinRaw = ingredient === null ? null : proteinPerMYRRaw(batch, ingredient);
  const proteinCooked = ingredient === null
    ? null
    : proteinPerMYRRetained(batch, ingredient, sessions, RETENTION);

  const remove = async () => {
    try {
      await deleteBatchCascade(batch.id);
    } catch (err) {
      console.error('Deleting a batch failed', err);
      // Dexie can reject (private browsing, quota, a blocked upgrade). Without
      // this, onChanged would never fire — fine on its own — but the promise
      // rejection would go unhandled and the user would tap "Yes, delete it"
      // to nothing: no error, no explanation, batch still sitting there.
      setConfirming(false);
      setError('Could not delete this batch — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    setConfirming(false);
    onChanged();
  };

  return (
    <article className="card batch">
      <h3 className="card__title" data-testid="batch-name">
        {ingredient?.name ?? 'This ingredient is no longer in your list'}
      </h3>

      <p className="batch__state" data-testid="batch-state">{STATE_LABELS[state]}</p>

      <p className="batch__remaining" data-testid="batch-remaining">
        {formatG(remaining)} raw left
        {cookedLeft > 0 && ` · ${formatG(cookedLeft)} cooked left`}
      </p>

      <p className="batch__purchase" data-testid="batch-purchase">
        {formatG(batch.rawWeightG)} for {formatMYR(batch.purchase.pricePaidMYR)}
        {batch.purchase.location !== '' && ` · ${batch.purchase.location}`}
        {' · '}{formatIsoDate(batch.purchase.date)}
      </p>

      {/* Cost needs the ingredient for its protein figures, so the whole block
          goes when the ingredient has been archived away. */}
      {ingredient !== null && (
        <p className="batch__cost" data-testid="batch-cost">
          {perKgRaw !== null && `${formatMYR(perKgRaw)}/kg raw`}
          {perKgCooked !== null && ` · ${formatMYR(perKgCooked)}/kg cooked`}
          {proteinRaw !== null && ` · ${proteinRaw.toFixed(1)}g protein per RM`}
          {proteinCooked !== null && ` (${proteinCooked.toFixed(1)}g after cooking)`}
        </p>
      )}

      {/* A batch cooked in one sitting renders flat: the list structure that
          several sittings need would only be noise around a single row. */}
      {mine.length === 1 && (
        <SessionRow
          batch={batch}
          ingredient={ingredient}
          session={mine[0]!}
          entries={entries}
          onChanged={onChanged}
          onEdit={(s) => onEditSession(batch, s)}
        />
      )}

      {mine.length > 1 && (
        <ul className="batch__sessions">
          {mine.map((s) => (
            <li key={s.id}>
              <SessionRow
                batch={batch}
                ingredient={ingredient}
                session={s}
                entries={entries}
                onChanged={onChanged}
                onEdit={(edited) => onEditSession(batch, edited)}
              />
            </li>
          ))}
        </ul>
      )}

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement —
              plain text, so role="alert" stays free to mean "a write just
              failed" (SessionRow's fix, after it shipped both roles at once). */}
          <p>
            Delete this batch? Its {mine.length} cook{mine.length === 1 ? '' : 's'} go
            with it, including {formatG(cookedLeft)} of cooked food still unaccounted for.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, delete it
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
          {remaining > 0 && ingredient !== null && (
            <button type="button" className="btn btn--primary" onClick={() => onCook(batch)}>
              Cook some
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => onEditBatch(batch)}>
            Edit purchase
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setError(null); setConfirming(true); }}
          >
            Delete batch
          </button>
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </article>
  );
}
