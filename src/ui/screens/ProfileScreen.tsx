import { useMemo, useState } from 'react';
import type { Goal, Profile, Sex } from '../../core/types';
import { bmr, calorieTarget, proteinGPerKgFor, proteinGPerLb, proteinTargetG, tdee } from '../../core/targets';
import { saveProfile } from '../../storage/profiles';

interface Draft {
  name: string; sex: Sex; birthYear: string; heightCm: string;
  weightKg: string; sessionsPerWeek: string; goal: Goal; proteinGPerKg: string;
}

const EMPTY: Draft = {
  name: '', sex: 'male', birthYear: '', heightCm: '',
  weightKg: '', sessionsPerWeek: '0', goal: 'maintain', proteinGPerKg: '',
};

function toProfile(d: Draft): Profile {
  return {
    id: crypto.randomUUID(),
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
  if (Number(d.heightCm) < 80 || Number(d.heightCm) > 250) return 'Please enter a height between 80cm and 250cm';
  if (Number(d.weightKg) < 20 || Number(d.weightKg) > 400) return 'Please enter a weight between 20kg and 400kg';
  const sessions = Number(d.sessionsPerWeek);
  if (!Number.isFinite(sessions) || sessions < 0 || sessions > 21) return 'Please enter between 0 and 21 sessions per week';
  return null;
}

export function ProfileScreen({ onSaved, today = new Date() }: { onSaved: (p: Profile) => void; today?: Date }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const preview = useMemo(() => {
    if (validate(draft, today.getUTCFullYear()) !== null) return null;
    const p = toProfile(draft);
    return {
      bmr: Math.round(bmr(p, today)),
      tdee: Math.round(tdee(p, today)),
      calories: Math.round(calorieTarget(p, today)),
      proteinG: Math.round(proteinTargetG(p)),
      gPerKg: proteinGPerKgFor(p),
      gPerLb: proteinGPerLb(p),
    };
  }, [draft, today]);

  const submit = async () => {
    const problem = validate(draft, today.getUTCFullYear());
    if (problem !== null) { setError(problem); return; }
    setError(null);
    const p = toProfile(draft);
    await saveProfile(p);
    onSaved(p);
  };

  return (
    <section>
      <h2>Profile</h2>

      <label htmlFor="name">Name</label>
      <input id="name" value={draft.name} onChange={(e) => set('name', e.target.value)} />

      <fieldset>
        <legend>Sex (used for the BMR formula)</legend>
        {(['male', 'female'] as const).map((s) => (
          <label key={s}>
            <input type="radio" name="sex" value={s} checked={draft.sex === s} onChange={() => set('sex', s)} />
            {s}
          </label>
        ))}
      </fieldset>

      <label htmlFor="birthYear">Birth year</label>
      <input id="birthYear" type="number" value={draft.birthYear} onChange={(e) => set('birthYear', e.target.value)} />

      <label htmlFor="heightCm">Height (cm)</label>
      <input id="heightCm" type="number" value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} />

      <label htmlFor="weightKg">Weight (kg)</label>
      <input id="weightKg" type="number" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />

      <label htmlFor="sessions">Exercise sessions per week</label>
      <input id="sessions" type="number" min={0} max={21} value={draft.sessionsPerWeek} onChange={(e) => set('sessionsPerWeek', e.target.value)} />

      <label htmlFor="goal">Goal</label>
      <select id="goal" value={draft.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
        <option value="cut">Cut</option>
        <option value="maintain">Maintain</option>
        <option value="bulk">Bulk</option>
      </select>

      <label htmlFor="proteinOverride">Protein target override (g/kg, optional)</label>
      <input id="proteinOverride" type="number" step={0.1} value={draft.proteinGPerKg} onChange={(e) => set('proteinGPerKg', e.target.value)} />

      {preview !== null && (
        <dl>
          <dt>BMR</dt><dd data-testid="bmr">{preview.bmr} kcal</dd>
          <dt>TDEE</dt><dd data-testid="tdee">{preview.tdee} kcal</dd>
          <dt>Daily calorie target</dt><dd data-testid="calorie-target">{preview.calories} kcal</dd>
          <dt>Daily protein target</dt>
          <dd data-testid="protein-target">
            {preview.proteinG} g ({preview.gPerKg.toFixed(1)} g/kg &middot; {preview.gPerLb.toFixed(2)} g/lb)
          </dd>
        </dl>
      )}

      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void submit()}>Save profile</button>
    </section>
  );
}
