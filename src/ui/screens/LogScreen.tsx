import { useMemo, useState } from 'react';
import { dayTotals, type MealContext } from '../../core/meals';
import { ageFrom, snapshotTargets } from '../../core/targets';
import { MEAL_LABEL_KEYS, type MealEntry, type MealLabel, type Profile } from '../../core/types';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { DV_US } from '../../data/dvUS';
import { RETENTION } from '../../data/retentionTable';
import { RNI_MIN_AGE, rniFor } from '../../data/rniMY';
import { AddEntryForm, type GroupOption } from '../components/AddEntryForm';
import { BackupReminder } from '../components/BackupReminder';
import { DayNav } from '../components/DayNav';
import { DayProgress } from '../components/DayProgress';
import { GroupDay } from '../components/GroupDay';
import { MealGroup } from '../components/MealGroup';
import { WeekCard } from '../components/WeekCard';
import { NutrientTable } from '../components/NutrientTable';
import { dayName, todayIso } from '../dates';
import { planRepeat, previousMeal } from '../../core/repeat';
import { addEntries, dayLogId } from '../../storage/meals';
import { entryItemName, MEAL_LABELS } from '../labels';
import { newId } from '../newId';
import { useCatalogue } from '../useCatalogue';
import { useGroups } from '../useGroups';
import { useKitchen } from '../useKitchen';
import { useLog } from '../useLog';

/**
 * The meal a new entry lands in unless the user says otherwise. Boundaries are
 * generous on purpose: being wrong is one tap to fix, and being asked every
 * time is a tap you always pay.
 */
function labelForHour(hour: number): MealLabel {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

/** The time a repeated meal is logged at; read on tap, never during render. */
const clockMs = (): number => Date.now();

type View = { kind: 'list' } | { kind: 'form'; label: MealLabel; editing?: MealEntry };

export function LogScreen({ profile, profiles = [], today = new Date() }: {
  profile: Profile | null;
  /** Everyone, so a group's members can be named and measured. */
  profiles?: readonly Profile[];
  today?: Date;
}) {
  const [date, setDate] = useState(() => todayIso(today));
  const [view, setView] = useState<View>({ kind: 'list' });
  const [repeatNotice, setRepeatNotice] = useState<{ text: string; warn: boolean } | null>(null);

  const { catalogue, all } = useCatalogue();
  const kitchen = useKitchen();
  const log = useLog(profile?.id ?? null, date);
  const { groups } = useGroups();
  // Bumped on every change, so the group overview re-reads everyone's day.
  const [version, setVersion] = useState(0);

  // Only groups the active profile eats with.
  const myGroups = useMemo(
    () => (profile === null ? [] : groups.filter((g) => g.memberIds.includes(profile.id))),
    [groups, profile],
  );

  const groupOptions: GroupOption[] = useMemo(() => myGroups.map((g) => ({
    id: g.id,
    name: g.name,
    members: g.memberIds
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is Profile => p !== undefined)
      .map((p) => ({ id: p.id, name: p.name, targets: snapshotTargets(p, today, rniFor, DV_US) })),
  })), [myGroups, profiles, today]);

  const ctx: MealContext = useMemo(() => ({
    sessions: kitchen.sessions,
    batches: kitchen.batches,
    ingredientById: (id) => all.find((i) => i.id === id),
    samples: kitchen.samples,
    categoryYield: CATEGORY_YIELD,
    retention: RETENTION,
  }), [kitchen.sessions, kitchen.batches, kitchen.samples, all]);

  const totals = useMemo(() => dayTotals(log.entries, ctx), [log.entries, ctx]);

  // A day that has been logged is measured against the targets frozen then.
  // A day that has not is measured against the profile's targets now — and
  // those are the ones that will be frozen when its first entry lands.
  const targets = useMemo(
    () => log.dayLog?.targets
      ?? (profile === null
        ? { kcal: 0, proteinG: 0, micros: {} }
        : snapshotTargets(profile, today, rniFor, DV_US)),
    [log.dayLog, profile, today],
  );

  if (profile === null) {
    return (
      <section className="screen">
        <h2>Log</h2>
        <p className="screen__hint" data-testid="log-no-profile">
          Set up a profile first — the Log measures what you eat against your daily
          calorie and protein targets, and those come from your body stats.
        </p>
      </section>
    );
  }

  if (view.kind === 'form') {
    return (
      <section className="screen">
        <AddEntryForm
          key={view.editing?.id ?? 'new'}
          profileId={profile.id}
          date={date}
          label={view.label}
          ctx={ctx}
          catalogue={catalogue}
          allEntries={kitchen.entries}
          targets={targets}
          editing={view.editing}
          profileName={profile.name}
          groups={groupOptions}
          onSaved={() => {
            setVersion((v) => v + 1);
            // Both: useLog holds the day, useKitchen holds every entry and so
            // every remainder. Refreshing one leaves the other stale.
            void log.refresh();
            void kitchen.refresh();
            setView({ kind: 'list' });
          }}
          onCancel={() => setView({ kind: 'list' })}
        />
      </section>
    );
  }

  const afterChange = () => { void log.refresh(); void kitchen.refresh(); setVersion((v) => v + 1); };

  // Copies what was eaten, never more than a cook still holds; anything that
  // no longer fits is named rather than silently dropped.
  const repeatMeal = async (label: MealLabel, from: { date: string; entries: MealEntry[] }) => {
    const plan = planRepeat(from.entries, ctx, kitchen.entries, { profileId: profile.id, date, label });
    const meal = MEAL_LABELS[label].toLowerCase();
    const skipped = plan.skipped.map((s) => `${entryItemName(s.entry, ctx)} (${s.reason.replace(/\.$/, '').toLowerCase()})`);
    if (plan.fields.length === 0) {
      setRepeatNotice({ text: `Nothing could be copied: ${skipped.join('; ')}.`, warn: true });
      return;
    }
    const now = clockMs();
    try {
      await addEntries(plan.fields.map((fields, i) => ({
        entry: { id: newId(), profileId: profile.id, date, label, createdAt: now + i, ...fields },
        snapshot: { id: dayLogId(profile.id, date), profileId: profile.id, date, targets },
      })));
    } catch (err) {
      console.error('Repeating a meal failed', err);
      setRepeatNotice({ text: 'Could not copy that meal — storage may be blocked or full. Please try again.', warn: true });
      return;
    }
    setRepeatNotice(skipped.length === 0
      ? { text: `Copied ${meal} from ${dayName(from.date, todayIso(today)).toLowerCase()}.`, warn: false }
      : { text: `Copied ${plan.fields.length} of ${from.entries.length} items. Not copied: ${skipped.join('; ')}.`, warn: true });
    afterChange();
  };
  const storageError = log.storageError ?? kitchen.storageError;

  return (
    <section className="screen">
      <h2>Log</h2>

      <BackupReminder today={today} />

      <DayNav date={date} today={todayIso(today)} onChange={(d) => { setDate(d); setRepeatNotice(null); }} />

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <DayProgress
        totals={totals.totals}
        targets={targets}
        proteinExact={totals.unknownProteinEntries === 0}
      />

      <div className="btn-row log__add">
        <button
          type="button"
          className="btn btn--primary"
          data-testid="add-entry"
          onClick={() => setView({ kind: 'form', label: labelForHour(today.getHours()) })}
        >
          Add something
        </button>
      </div>

      {repeatNotice !== null && (
        <p role="status" className={`banner ${repeatNotice.warn ? 'banner--warn' : 'banner--info'}`}>
          {repeatNotice.text}
        </p>
      )}

      {MEAL_LABEL_KEYS.map((label) => {
        const before = previousMeal(kitchen.entries, profile.id, label, date);
        return (
        <MealGroup
          key={label}
          label={label}
          entries={log.entries.filter((e) => e.label === label)}
          repeat={before === null ? undefined : {
            from: dayName(before.date, todayIso(today)).toLowerCase(),
            count: before.entries.length,
            onRepeat: () => { void repeatMeal(label, before); },
          }}
          ctx={ctx}
          onAdd={() => setView({ kind: 'form', label })}
          onEdit={(entry) => setView({ kind: 'form', label: entry.label, editing: entry })}
          onChanged={afterChange}
        />
        );
      })}

      <WeekCard
        profileId={profile.id}
        endDate={date}
        entries={kitchen.entries}
        batches={kitchen.batches}
        samples={kitchen.samples}
        ctx={ctx}
        version={version}
      />

      {myGroups.map((g) => (
        <GroupDay key={g.id} group={g} profiles={profiles} date={date} ctx={ctx} today={today} version={version} />
      ))}

      {log.entries.length > 0 && (
        <div className="card">
          <h3 className="card__title">Nutrients for the day</h3>
          {totals.unknownMicroEntries > 0 && (
            <p className="flag" data-testid="micro-floor">
              At least these amounts — {totals.unknownMicroEntries} quick{' '}
              {totals.unknownMicroEntries === 1 ? 'entry has' : 'entries have'} no
              micronutrient figures, so the real total is higher.
            </p>
          )}
          <div className="table-scroll">
            <NutrientTable
              totals={totals.totals}
              targets={targets.micros}
              assumedRetentionFor={[]}
              belowRniAge={ageFrom(profile, today) < RNI_MIN_AGE}
            />
          </div>
        </div>
      )}
    </section>
  );
}
