import { useMemo, useState } from 'react';
import type { Goal, Profile, Sex } from '../../core/types';
import { bmr, calorieTarget, proteinGPerKgFor, proteinGPerLb, proteinTargetG, tdee, explainTargets } from '../../core/targets';
import { saveProfile } from '../../storage/profiles';
import { ExplainedValue } from './ExplainedValue';

/** Matches the thousands-separator convention NutrientTable already uses. */
const kcal = (v: number): string => `${v.toLocaleString('en-MY')} kcal`;
import { newId } from '../newId';

interface Draft {
  name: string; sex: Sex; birthYear: string; heightCm: string;
  weightKg: string; sessionsPerWeek: string; goal: Goal; proteinGPerKg: string;
}

const EMPTY: Draft = {
  name: '', sex: 'male', birthYear: '', heightCm: '',
  weightKg: '', sessionsPerWeek: '0', goal: 'maintain', proteinGPerKg: '',
};

/** An absent override stays an empty field, so clearing it can drop it again. */
const draftFrom = (p: Profile): Draft => ({
  name: p.name,
  sex: p.sex,
  birthYear: `${p.birthYear}`,
  heightCm: `${p.heightCm}`,
  weightKg: `${p.weightKg}`,
  sessionsPerWeek: `${p.sessionsPerWeek}`,
  goal: p.goal,
  proteinGPerKg: p.proteinGPerKg === undefined ? '' : `${p.proteinGPerKg}`,
});

/**
 * `existingId` is the whole of the create-vs-edit distinction. Without it every
 * save minted a fresh id, so editing your weight added a second profile rather
 * than correcting the first — and since App picked `profiles[0]`, which one you
 * then saw came down to UUID sort order.
 */
function toProfile(d: Draft, existingId?: string): Profile {
  return {
    id: existingId ?? newId(),
    name: d.name.trim(),
    sex: d.sex,
    birthYear: Number(d.birthYear),
    heightCm: Number(d.heightCm),
    weightKg: Number(d.weightKg),
    sessionsPerWeek: Number(d.sessionsPerWeek),
    goal: d.goal,
    ...(d.proteinGPerKg.trim() === '' ? {} : { proteinGPerKg: Number(d.proteinGPerKg) }),
  };
}

function validate(d: Draft, currentYear: number): string | null {
  if (d.name.trim() === '') return 'Please enter a name';
  const year = Number(d.birthYear);
  if (!Number.isInteger(year) || year < 1900 || year > currentYear - 10) {
    return `Please enter a birth year between 1900 and ${currentYear - 10}`;
  }
  const heightCm = Number(d.heightCm);
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250) return 'Please enter a height between 80cm and 250cm';
  const weightKg = Number(d.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) return 'Please enter a weight between 20kg and 400kg';
  const sessions = Number(d.sessionsPerWeek);
  if (!Number.isFinite(sessions) || sessions < 0 || sessions > 21) return 'Please enter between 0 and 21 sessions per week';
  return null;
}

interface Props {
  /** Absent means create; present means edit that profile in place. */
  profile?: Profile;
  onSaved: (p: Profile) => void;
  /** Absent when the form is the whole screen and there is nothing to go back to. */
  onCancel?: () => void;
  today?: Date;
}

export function ProfileForm({ profile, onSaved, onCancel, today = new Date() }: Props) {
  const [draft, setDraft] = useState<Draft>(() => (profile === undefined ? EMPTY : draftFrom(profile)));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const preview = useMemo(() => {
    if (validate(draft, today.getUTCFullYear()) !== null) return null;
    const p = toProfile(draft, profile?.id);
    return {
      bmr: Math.round(bmr(p, today)),
      tdee: Math.round(tdee(p, today)),
      calories: Math.round(calorieTarget(p, today)),
      proteinG: Math.round(proteinTargetG(p)),
      gPerKg: proteinGPerKgFor(p),
      gPerLb: proteinGPerLb(p),
      explain: explainTargets(p, today),
    };
  }, [draft, today, profile]);

  const submit = async () => {
    const problem = validate(draft, today.getUTCFullYear());
    if (problem !== null) { setError(problem); return; }
    setError(null);
    const p = toProfile(draft, profile?.id);
    try {
      await saveProfile(p);
    } catch {
      // Dexie can reject (private browsing, quota, a blocked upgrade) — without this the
      // promise rejection would be unhandled, onSaved would never fire, and the user would
      // tap Save to nothing: no error, no navigation, form unchanged.
      setError('Could not save your profile — your browser may be blocking storage (for example, private browsing) or storage may be full. Please try again.');
      return;
    }
    onSaved(p);
  };

  return (
    <section className="screen">
      <h2>Profile</h2>
      <p className="screen__hint">Your body stats produce the calorie and protein targets every other screen measures food against.</p>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </div>

      <fieldset>
        <legend>Sex (used for the BMR formula)</legend>
        <div className="choice-row">
        {(['male', 'female'] as const).map((s) => (
          <label key={s} className="choice">
            <input type="radio" name="sex" value={s} checked={draft.sex === s} onChange={() => set('sex', s)} />
            {s}
          </label>
        ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="birthYear">Birth year</label>
        <input id="birthYear" type="number" value={draft.birthYear} onChange={(e) => set('birthYear', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="heightCm">Height (cm)</label>
        <input id="heightCm" type="number" value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="weightKg">Weight (kg)</label>
        <input id="weightKg" type="number" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="sessions">Exercise sessions per week</label>
        <input id="sessions" type="number" min={0} max={21} value={draft.sessionsPerWeek} onChange={(e) => set('sessionsPerWeek', e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="goal">Goal</label>
        <select id="goal" value={draft.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
          <option value="cut">Cut</option>
          <option value="maintain">Maintain</option>
          <option value="bulk">Bulk</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="proteinOverride">Protein target override (g/kg, optional)</label>
        <input id="proteinOverride" type="number" step={0.1} value={draft.proteinGPerKg} onChange={(e) => set('proteinGPerKg', e.target.value)} />
      </div>

      {preview !== null && (
        <div className="card">
          <h3 className="card__title">Your daily targets</h3>
          <p className="screen__hint explained__intro">Tap any figure to see how it was worked out.</p>
          <ExplainedValue
            label="BMR" testId="bmr"
            value={kcal(preview.bmr)} steps={preview.explain.bmr}
          />
          <ExplainedValue
            label="TDEE" testId="tdee"
            value={kcal(preview.tdee)} steps={preview.explain.tdee}
          />
          <ExplainedValue
            label="Daily calorie target" testId="calorie-target"
            value={kcal(preview.calories)} steps={preview.explain.calories}
          />
          <ExplainedValue
            label="Daily protein target" testId="protein-target"
            value={`${preview.proteinG} g (${preview.gPerKg.toFixed(1)} g/kg · ${preview.gPerLb.toFixed(2)} g/lb)`}
            steps={preview.explain.protein}
          />
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => void submit()}>Save profile</button>
        {onCancel !== undefined && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        )}
      </div>
    </section>
  );
}
