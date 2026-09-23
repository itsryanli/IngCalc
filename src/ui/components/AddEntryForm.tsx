import { useId, useMemo, useState } from 'react';
import { cookedRemainingG, EPSILON } from '../../core/batch';
import { entryNutrients, validateEntry, type MealContext } from '../../core/meals';
import { COOK_METHODS, type CookMethod, type DayLogTargets, type Ingredient,
  type IsoDate, type MealEntry, type MealEntryFields, type MealLabel } from '../../core/types';
import { g, type Grams } from '../../core/units';
import { addEntry, dayLogId, updateEntry } from '../../storage/meals';
import { describeAvailable, METHOD_LABELS } from '../labels';
import { newId } from '../newId';
import { IngredientPicker } from './IngredientPicker';
import { WeightInput, type WeightUnit } from './WeightInput';

type Source = 'kitchen' | 'ingredient' | 'quick';

const SOURCE_LABELS: Record<Source, string> = {
  kitchen: 'From the kitchen', ingredient: 'Any ingredient', quick: 'Quick add',
};

/** An entry being edited cannot change its source; the three are different things. */
const sourceOf = (entry: MealEntry): Source =>
  entry.kind === 'quick' ? 'quick' : entry.kind === 'ingredient' ? 'ingredient' : 'kitchen';

/**
 * Every field's initial value is read from `editing` in a `useState`
 * initializer, which React runs exactly once per mount — it is not
 * re-derived if `editing` changes on an already-mounted instance. A caller
 * that swaps `editing` (add → edit, or edit-A → edit-B) on the *same* element
 * therefore keeps the previous draft's text in every field and, at save time,
 * writes it under the new entry's `id`/`createdAt` — a silent wrong-row
 * overwrite with no error to surface it.
 *
 * The caller must force a remount on every switch between entries, e.g.
 * `<AddEntryForm key={editing?.id ?? 'new'} editing={editing} .../>`.
 */
interface Props {
  profileId: string;
  date: IsoDate;
  label: MealLabel;
  ctx: MealContext;
  catalogue: readonly Ingredient[];
  /** Every entry in the database — a cook made last week can be eaten today. */
  allEntries: readonly MealEntry[];
  targets: DayLogTargets;
  editing?: MealEntry;
  onSaved: () => void;
  onCancel: () => void;
}

export function AddEntryForm({
  profileId, date, label, ctx, catalogue, allEntries, targets, editing, onSaved, onCancel,
}: Props) {
  const ids = useId();
  const [source, setSource] = useState<Source>(editing === undefined ? 'kitchen' : sourceOf(editing));
  const [error, setError] = useState<string | null>(null);

  // From-the-kitchen
  const [sessionId, setSessionId] = useState(
    editing !== undefined && (editing.kind === 'portion' || editing.kind === 'weight')
      ? editing.cookSessionId : '');
  const [byWeight, setByWeight] = useState(editing?.kind === 'weight');
  const [portions, setPortions] = useState(editing?.kind === 'portion' ? `${editing.portions}` : '1');
  const [grams, setGrams] = useState<Grams>(editing?.kind === 'weight' ? editing.grams : g(0));
  // Its own unit, not the ingredient path's: WeightInput renders the g/kg
  // control unconditionally, so a hard-coded 'g' with a no-op handler left the
  // kg button inert and its aria-pressed permanently wrong.
  const [kitchenUnit, setKitchenUnit] = useState<WeightUnit>('g');

  // Any-ingredient
  const [ingredientId, setIngredientId] = useState(
    editing?.kind === 'ingredient' ? editing.ingredientId : '');
  const [method, setMethod] = useState<CookMethod>(
    editing?.kind === 'ingredient' ? editing.method : 'boiled');
  const [cookedG, setCookedG] = useState<Grams>(
    editing?.kind === 'ingredient' ? editing.cookedG : g(0));
  const [unit, setUnit] = useState<WeightUnit>('g');

  // Quick
  const [name, setName] = useState(editing?.kind === 'quick' ? editing.name : '');
  const [kcalText, setKcalText] = useState(editing?.kind === 'quick' ? `${editing.kcal}` : '');
  const [proteinText, setProteinText] = useState(
    editing?.kind === 'quick' && editing.proteinG !== undefined ? `${editing.proteinG}` : '');

  // Entries excluding the one being edited, so a cook the edit already occupies
  // still shows the room that entry is using.
  const others = useMemo(
    () => allEntries.filter((e) => e.id !== (editing?.id ?? null)),
    [allEntries, editing],
  );

  const available = useMemo(
    () => ctx.sessions
      .map((s) => ({ session: s, left: cookedRemainingG(s, others) }))
      // EPSILON, not a bare 0: a portion split (e.g. 61g over 7 portions) leaves
      // float residue on the order of 1e-15g, which is not a portion anyone can
      // eat. Without the tolerance that residue renders a clickable row reading
      // "0g left" that Save then refuses — see EPSILON's use in
      // core/batch.ts's batchState and core/meals.ts's validateEntry.
      .filter((a) => a.left > EPSILON)
      .sort((a, b) => b.session.cookedAt.localeCompare(a.session.cookedAt)),
    [ctx.sessions, others],
  );

  const draft = (): MealEntryFields | null => {
    if (source === 'quick') {
      const kcal = Number(kcalText.trim());
      const proteinRaw = proteinText.trim();
      return {
        kind: 'quick', name,
        kcal: kcalText.trim() === '' ? NaN : kcal,
        ...(proteinRaw === '' ? {} : { proteinG: Number(proteinRaw) }),
      };
    }
    if (source === 'ingredient') {
      return { kind: 'ingredient', ingredientId, method, cookedG };
    }
    if (sessionId === '') return null;
    return byWeight
      ? { kind: 'weight', cookSessionId: sessionId, grams }
      : { kind: 'portion', cookSessionId: sessionId, portions: Number(portions) };
  };

  // Shown live, before saving. This readout is what makes removing Calc's
  // hand-off a simplification rather than a loss: the form answers the question
  // you would otherwise have opened the calculator to ask.
  const preview = useMemo(() => {
    const d = draft();
    if (d === null) return null;
    const probe: MealEntry = { id: 'preview', profileId, date, label, createdAt: 0, ...d };
    const n = entryNutrients(probe, ctx);
    return n.kcal > 0 || n.protein > 0 ? n : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sessionId, byWeight, portions, grams, ingredientId, method, cookedG,
      name, kcalText, proteinText, ctx]);

  const save = async () => {
    const d = draft();
    if (d === null) { setError('Choose something from the kitchen first.'); return; }

    const check = validateEntry(d, ctx, others, editing?.id ?? null);
    if (!check.ok) { setError(check.message); return; }
    setError(null);

    const entry: MealEntry = {
      id: editing?.id ?? newId(),
      profileId,
      date,
      label,
      // Preserved on edit so an edited entry keeps its place in the day.
      createdAt: editing?.createdAt ?? Date.now(),
      ...d,
    };

    try {
      if (editing === undefined) {
        await addEntry(entry, { id: dayLogId(profileId, date), profileId, date, targets });
      } else {
        await updateEntry(entry);
      }
    } catch (err) {
      console.error('Saving a meal entry failed', err);
      setError('Could not save that — storage may be blocked or full. Please try again.');
      return;
    }

    onSaved();
  };

  const selected = ctx.sessions.find((s) => s.id === sessionId) ?? null;

  return (
    <div className="card entry-form">
      <h3 className="card__title">{editing === undefined ? 'Add to' : 'Edit'} {label}</h3>

      {editing === undefined && (
        <div className="seg" role="group" aria-label="Where this came from">
          {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
            <button
              key={s}
              type="button"
              className="seg__btn"
              aria-pressed={source === s}
              onClick={() => { setError(null); setSource(s); }}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {source === 'kitchen' && (
        <>
          {available.length === 0 ? (
            <p className="screen__hint">
              Nothing cooked is left in the kitchen. Log a cook there, or use
              <strong> Any ingredient</strong> for something you did not buy as a batch.
            </p>
          ) : (
            <ul className="available">
              {available.map(({ session, left }) => (
                <li key={session.id}>
                  <button
                    type="button"
                    data-testid={`available-${session.id}`}
                    className={`available__item${sessionId === session.id ? ' available__item--on' : ''}`}
                    aria-pressed={sessionId === session.id}
                    onClick={() => setSessionId(session.id)}
                  >
                    {describeAvailable(session, left, others, ctx)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected !== null && (
            <>
              {/* Not "How much" — that collides with getByLabelText(/how much/i) matching
                  the weight/portions input itself, since aria-label counts as a label source. */}
              <div className="seg" role="group" aria-label="Measure by">
                <button type="button" aria-pressed={!byWeight} className="seg__btn"
                        onClick={() => setByWeight(false)}>Portions</button>
                <button type="button" aria-pressed={byWeight} className="seg__btn"
                        onClick={() => setByWeight(true)}>A weighed amount</button>
              </div>

              {byWeight ? (
                <WeightInput value={grams} unit={kitchenUnit} label="How much did you eat?"
                             onChange={setGrams} onUnitChange={setKitchenUnit} />
              ) : (
                <div className="field">
                  <label htmlFor={`${ids}-portions`}>How many portions?</label>
                  <input id={`${ids}-portions`} type="number" inputMode="decimal"
                         min={0} step="0.5" value={portions}
                         onChange={(e) => setPortions(e.target.value)} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {source === 'ingredient' && (
        <>
          <IngredientPicker
            catalogue={catalogue}
            value={ingredientId}
            onChange={setIngredientId}
            // Adding an ingredient mid-meal is a Kitchen job; keeping the flow
            // out of here is what stops this form growing a second screen.
            onAddNew={() => setError('Add new ingredients from the Kitchen tab.')}
          />
          <div className="field">
            <label htmlFor={`${ids}-method`}>How was it cooked?</label>
            <select id={`${ids}-method`} value={method}
                    onChange={(e) => setMethod(e.target.value as CookMethod)}>
              {COOK_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </select>
          </div>
          <WeightInput value={cookedG} unit={unit} label="How much did you eat? (cooked)"
                       onChange={setCookedG} onUnitChange={setUnit} />
        </>
      )}

      {source === 'quick' && (
        <>
          <div className="field">
            <label htmlFor={`${ids}-name`}>What was it?</label>
            <input id={`${ids}-name`} type="text" value={name}
                   onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-kcal`}>Roughly how many calories?</label>
            <input id={`${ids}-kcal`} type="number" inputMode="decimal" min={0}
                   value={kcalText} onChange={(e) => setKcalText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-protein`}>Protein in grams (optional)</label>
            <input id={`${ids}-protein`} type="number" inputMode="decimal" min={0}
                   value={proteinText} onChange={(e) => setProteinText(e.target.value)} />
            <p className="field__hint">
              Leave blank if you do not know — the day will say "at least" instead of
              claiming a figure it does not have.
            </p>
          </div>
        </>
      )}

      {preview !== null && (
        <p className="entry-form__preview" data-testid="entry-preview">
          {Math.round(preview.kcal).toLocaleString('en-MY')} kcal ·{' '}
          {Math.round(preview.protein)}g protein
        </p>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void save(); }}>
          Save
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      </div>

      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
