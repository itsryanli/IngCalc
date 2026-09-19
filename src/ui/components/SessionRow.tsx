import { useState } from 'react';
import { cookedRemainingG, EPSILON, portionsRemaining } from '../../core/batch';
import { flagYield } from '../../core/calibration';
import { costPerPortion } from '../../core/cost';
import type { Batch, CookSession, Ingredient, MealEntry } from '../../core/types';
import { formatG, formatMYR } from '../../core/units';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { deleteCookSession, saveCookSession } from '../../storage/kitchen';
import { formatIsoDate } from '../dates';
import { METHOD_LABELS } from '../labels';

interface Props {
  batch: Batch;
  ingredient: Ingredient | null;
  session: CookSession;
  /** Every entry in the kitchen; the remainder is derived from the ones that cite this cook. */
  entries: readonly MealEntry[];
  onChanged: () => void;
  onEdit: (session: CookSession) => void;
}

export function SessionRow({ batch, ingredient, session, entries, onChanged, onEdit }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = cookedRemainingG(session, entries);
  const portionsLeft = portionsRemaining(session, entries);

  // Ingredients are archived, never deleted, precisely because batches like
  // this one reference them — but useCatalogue filters archived ones out, so
  // the ingredient handed in here can be null. Only the flag needs it.
  const flag = ingredient === null ? null : flagYield(session, ingredient, CATEGORY_YIELD);
  const perPortion = costPerPortion(batch, session);

  const toggleExclude = async () => {
    try {
      await saveCookSession({ ...session, excludeFromCalibration: !session.excludeFromCalibration });
    } catch (err) {
      console.error('Toggling exclude-from-calibration failed', err);
      setError('Could not update this cook — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    onChanged();
  };

  const remove = async () => {
    try {
      await deleteCookSession(session.id);
    } catch (err) {
      console.error('Deleting a cook session failed', err);
      setConfirming(false);
      setError('Could not delete this cook — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    setConfirming(false);
    onChanged();
  };

  return (
    <div className="session">
      <p className="session__summary" data-testid="session-summary">
        {METHOD_LABELS[session.method]} · {formatG(session.rawUsedG)} raw →{' '}
        {formatG(session.cookedWeightG)} cooked · {session.portionCount} portions ·{' '}
        {formatIsoDate(session.cookedAt)}
      </p>

      {perPortion !== null && (
        <p className="session__cost" data-testid="session-cost">
          {formatMYR(perPortion)} per portion
        </p>
      )}

      {/* Advisory, never blocking: the cook is kept and the user decides. */}
      {flag !== null && (
        <p className={`flag flag--${flag.kind}`} data-testid="outlier-flag">
          {flag.reason}
        </p>
      )}

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={session.excludeFromCalibration}
          onChange={() => { void toggleExclude(); }}
        />
        Ignore this cook when working out my yields
      </label>

      <p className="session__remaining" data-testid="remaining">
        {/* EPSILON, not 0: eating every portion of a cook whose portion weight
            does not divide exactly (460g over 7) leaves a residue of ~6e-14g,
            which read as "0g left · 0.0 portions" under a bare zero while the
            card header above it — on `batchState`'s EPSILON — read "Finished". */}
        {remaining <= EPSILON
          ? 'All eaten'
          : `${formatG(remaining)} left · ${portionsLeft.toFixed(1)} portions`}
      </p>

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement — plain
              text, so role="alert" stays free to mean "a write just failed". */}
          <p>
            Delete this cook? {formatG(remaining)} of it is still
            unaccounted for, and its raw weight goes back to the batch.
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
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(session)}>
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
