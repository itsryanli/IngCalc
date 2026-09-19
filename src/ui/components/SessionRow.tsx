import { useState } from 'react';
import { flagYield } from '../../core/calibration';
import { costPerPortion } from '../../core/cost';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { formatG, formatMYR } from '../../core/units';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { deleteCookSession, saveCookSession } from '../../storage/kitchen';
import { formatIsoDate } from '../dates';
import { METHOD_LABELS } from '../labels';
import { EatControl } from './EatControl';

interface Props {
  batch: Batch;
  ingredient: Ingredient | null;
  session: CookSession;
  onChanged: () => void;
  onEdit: (session: CookSession) => void;
}

export function SessionRow({ batch, ingredient, session, onChanged, onEdit }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <EatControl session={session} onEaten={onChanged} />

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement — plain
              text, so role="alert" stays free to mean "a write just failed". */}
          <p>
            Delete this cook? {formatG(session.cookedRemainingG)} of it is still
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
