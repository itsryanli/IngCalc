import { useMemo, useState } from 'react';
import {
  rawRemainingG, rescaleCookedRemaining, validateCook, validateRawUsedEdit,
} from '../../core/batch';
import { flagYield } from '../../core/calibration';
import { COOK_METHODS, type Batch, type CookMethod, type CookSession, type Ingredient, type YieldSample } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { resolveYield } from '../../core/yieldResolver';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { saveCookSession } from '../../storage/kitchen';
import { todayIso } from '../dates';
import { METHOD_LABELS } from '../labels';
import { newId } from '../newId';
import { WeightInput, type WeightUnit } from './WeightInput';
import { YieldBadge } from './YieldBadge';

interface Props {
  batch: Batch;
  ingredient: Ingredient;
  /** Every session of this batch, including the one being edited. */
  sessions: readonly CookSession[];
  /** All samples across the kitchen, so the badge can show a measured factor. */
  samples: readonly YieldSample[];
  /** Present when editing. */
  session?: CookSession;
  today?: Date;
  onSaved: (session: CookSession) => void;
  onCancel: () => void;
}

export function CookSessionForm({
  batch, ingredient, sessions, samples, session, today = new Date(), onSaved, onCancel,
}: Props) {
  const editing = session !== undefined;

  // Cooking the whole remainder is the common case, so it is the default.
  const defaultRaw = session?.rawUsedG ?? rawRemainingG(batch, sessions);

  const [method, setMethod] = useState<CookMethod>(session?.method ?? 'roasted');
  const [rawUsedG, setRawUsedG] = useState<Grams>(defaultRaw);
  const [rawUnit, setRawUnit] = useState<WeightUnit>('g');
  const [cookedWeightG, setCookedWeightG] = useState<Grams>(session?.cookedWeightG ?? g(0));
  const [cookedUnit, setCookedUnit] = useState<WeightUnit>('g');
  const [portionText, setPortionText] = useState(`${session?.portionCount ?? 1}`);
  const [cookedAt, setCookedAt] = useState(session?.cookedAt ?? todayIso(today));
  const [error, setError] = useState<string | null>(null);

  const resolved = useMemo(
    () => resolveYield(ingredient, method, samples, CATEGORY_YIELD),
    [ingredient, method, samples],
  );

  // Advisory, and shown live: the user is standing at the scale and can still
  // re-read it. Blocking happens in validateCook, which only refuses the
  // impossible band.
  const flag = useMemo(
    () => (cookedWeightG > 0 && rawUsedG > 0
      ? flagYield({ method, rawUsedG, cookedWeightG }, ingredient, CATEGORY_YIELD)
      : null),
    [method, rawUsedG, cookedWeightG, ingredient],
  );

  const submit = async () => {
    const portionCount = Number(portionText.trim());
    const draft = { method, rawUsedG, cookedWeightG, portionCount, cookedAt };

    // When editing, this session's own raw weight must be measured against
    // what the OTHER sessions left, not against the whole-batch remainder
    // that already has this session subtracted from it.
    const check = editing
      ? validateRawUsedEdit(batch, sessions, session.id, rawUsedG)
      : validateCook(batch, sessions, draft, ingredient, CATEGORY_YIELD);
    if (!check.ok) { setError(check.message); return; }

    if (editing) {
      const rest = validateCook(
        batch,
        sessions.filter((s) => s.id !== session.id),
        draft,
        ingredient,
        CATEGORY_YIELD,
      );
      if (!rest.ok) { setError(rest.message); return; }
    }

    setError(null);
    const saved: CookSession = {
      id: session?.id ?? newId(),
      batchId: batch.id,
      method,
      rawUsedG,
      cookedWeightG,
      // A new session has eaten nothing. An edited one keeps the fraction
      // already eaten rather than the grams, which were a reading of the
      // same food.
      cookedRemainingG: editing
        ? rescaleCookedRemaining(session, cookedWeightG)
        : cookedWeightG,
      cookedAt,
      portionCount,
      excludeFromCalibration: session?.excludeFromCalibration ?? false,
    };

    try {
      await saveCookSession(saved);
    } catch {
      // Dexie can reject (private browsing, quota, a blocked upgrade) —
      // without this the promise rejection would be unhandled, onSaved would
      // never fire, and the user would tap Save to nothing: no error, no
      // navigation, form unchanged.
      setError(
        'Could not save this cook — your browser may be blocking storage ' +
        '(for example, private browsing) or storage may be full. Please try again.',
      );
      return;
    }

    onSaved(saved);
  };

  return (
    <div className="screen">
      <h3>{editing ? 'Edit this cook' : `Cook some ${ingredient.name.toLowerCase()}`}</h3>

      <div className="field">
        <label htmlFor="cook-method">Cooking method</label>
        <select
          id="cook-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as CookMethod)}
        >
          {COOK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
        </select>
      </div>

      <YieldBadge resolved={resolved} published={ingredient.publishedYield[method]} />

      <WeightInput
        label="Raw weight used"
        value={rawUsedG}
        unit={rawUnit}
        onChange={setRawUsedG}
        onUnitChange={setRawUnit}
      />

      <WeightInput
        label="Cooked weight"
        value={cookedWeightG}
        unit={cookedUnit}
        onChange={setCookedWeightG}
        onUnitChange={setCookedUnit}
      />

      {flag !== null && (
        <p className={`flag flag--${flag.kind}`} data-testid="outlier-warning">
          {flag.reason}
        </p>
      )}

      <div className="field">
        <label htmlFor="cook-portions">Portions</label>
        <input
          id="cook-portions"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={portionText}
          onChange={(e) => setPortionText(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="cook-date">Date cooked</label>
        <input
          id="cook-date"
          type="date"
          value={cookedAt}
          onChange={(e) => setCookedAt(e.target.value)}
        />
      </div>

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
