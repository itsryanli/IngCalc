import { useMemo, useState } from 'react';
import { dayTotals, type MealContext } from '../../core/meals';
import { ageFrom, snapshotTargets } from '../../core/targets';
import { MEAL_LABEL_KEYS, type MealEntry, type MealLabel, type Profile } from '../../core/types';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { DV_US } from '../../data/dvUS';
import { RETENTION } from '../../data/retentionTable';
import { RNI_MIN_AGE, rniFor } from '../../data/rniMY';
import { AddEntryForm } from '../components/AddEntryForm';
import { DayNav } from '../components/DayNav';
import { DayProgress } from '../components/DayProgress';
import { MealGroup } from '../components/MealGroup';
import { NutrientTable } from '../components/NutrientTable';
import { todayIso } from '../dates';
import { useCatalogue } from '../useCatalogue';
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

type View = { kind: 'list' } | { kind: 'form'; label: MealLabel; editing?: MealEntry };

export function LogScreen({ profile, today = new Date() }: { profile: Profile | null; today?: Date }) {
  const [date, setDate] = useState(() => todayIso(today));
  const [view, setView] = useState<View>({ kind: 'list' });

  const { catalogue } = useCatalogue();
  const kitchen = useKitchen();
  const log = useLog(profile?.id ?? null, date);

  const ctx: MealContext = useMemo(() => ({
    sessions: kitchen.sessions,
    batches: kitchen.batches,
    ingredientById: (id) => catalogue.find((i) => i.id === id),
    samples: kitchen.samples,
    categoryYield: CATEGORY_YIELD,
    retention: RETENTION,
  }), [kitchen.sessions, kitchen.batches, kitchen.samples, catalogue]);

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
          onSaved={() => {
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

  const afterChange = () => { void log.refresh(); void kitchen.refresh(); };
  const storageError = log.storageError ?? kitchen.storageError;

  return (
    <section className="screen">
      <h2>Log</h2>

      <DayNav date={date} today={todayIso(today)} onChange={setDate} />

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <DayProgress
        totals={totals.totals}
        targets={targets}
        proteinExact={totals.unknownProteinEntries === 0}
      />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          data-testid="add-entry"
          onClick={() => setView({ kind: 'form', label: labelForHour(today.getHours()) })}
        >
          Add something
        </button>
      </div>

      {MEAL_LABEL_KEYS.map((label) => (
        <MealGroup
          key={label}
          label={label}
          entries={log.entries.filter((e) => e.label === label)}
          ctx={ctx}
          onAdd={() => setView({ kind: 'form', label })}
          onEdit={(entry) => setView({ kind: 'form', label: entry.label, editing: entry })}
          onChanged={afterChange}
        />
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
