import { useState } from 'react';
import {
  applyEat, portionsRemaining, portionsToGrams, portionWeightG, validateEat,
} from '../../core/batch';
import type { CookSession } from '../../core/types';
import { formatG, g, type Grams } from '../../core/units';
import { saveCookSession } from '../../storage/kitchen';

/**
 * Eating decrements the stored remainder and writes nothing else. Phase 3
 * introduces meals as the record of where the food went; until then the
 * question this screen answers is only "how much is left".
 */
export function EatControl({
  session, onEaten,
}: { session: CookSession; onEaten: (updated: CookSession) => void }) {
  const [weighedText, setWeighedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = session.cookedRemainingG;
  const portionsLeft = portionsRemaining(session);
  const finished = remaining <= 0;

  const eat = async (grams: Grams) => {
    const check = validateEat(session, grams);
    if (!check.ok) { setError(check.message); return; }

    setError(null);
    const updated = applyEat(session, grams);
    try {
      await saveCookSession(updated);
    } catch {
      setError(
        'Could not record that — your browser may be blocking storage ' +
        '(for example, private browsing) or storage may be full. Please try again.',
      );
      return;
    }

    setWeighedText('');
    onEaten(updated);
  };

  const eatWeighed = () => {
    const parsed = Number(weighedText.trim());
    if (weighedText.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setError('Enter how much you ate, in grams.');
      return;
    }
    void eat(g(parsed));
  };

  return (
    <div className="eat">
      <p className="eat__remaining" data-testid="remaining">
        {finished
          ? 'All eaten'
          : `${formatG(remaining)} left · ${portionsLeft.toFixed(1)} portions`}
      </p>

      {!finished && (
        <>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => { void eat(portionsToGrams(session, 1)); }}
            >
              Eat 1 portion ({formatG(portionWeightG(session))})
            </button>
          </div>

          <div className="field">
            <label htmlFor={`weighed-${session.id}`}>Weighed amount (g)</label>
            <input
              id={`weighed-${session.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              value={weighedText}
              onChange={(e) => setWeighedText(e.target.value)}
            />
          </div>

          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={eatWeighed}>
              Eat this much
            </button>
          </div>
        </>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
