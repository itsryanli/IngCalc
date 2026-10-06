import { useEffect, useMemo, useState } from 'react';
import type { MealContext } from '../../core/meals';
import { NOT_COOKED, type Batch, type DayLog, type IsoDate, type MealEntry, type YieldSample } from '../../core/types';
import { formatMYR, myr } from '../../core/units';
import {
  bestValueBetween, milestones, spentBetween, summariseWeek, weekDays, yieldsLearned,
} from '../../core/week';
import { loadDayLogs } from '../../storage/meals';
import { getSettings } from '../../storage/settings';
import { shiftIso } from '../dates';

const WEEKDAY = (iso: IsoDate): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-MY', { weekday: 'short' });
};

const round = (n: number) => Math.round(n).toLocaleString('en-MY');

interface Props {
  profileId: string;
  /** The last day of the seven: the day being viewed. */
  endDate: IsoDate;
  /** Every meal entry; this card picks out the profile's own. */
  entries: readonly MealEntry[];
  batches: readonly Batch[];
  samples: readonly YieldSample[];
  ctx: MealContext;
  /** Bumped by the Log on every change, so the card re-reads the day logs. */
  version: number;
}

/**
 * The last seven days at a glance, with a few honest signs of progress. Nothing
 * here rewards eating less or resets after a missed day: an unlogged day is a
 * grey dot, not a broken streak.
 */
export function WeekCard({ profileId, endDate, entries, batches, samples, ctx, version }: Props) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftIso(endDate, i - 6)), [endDate]);
  const [dayLogs, setDayLogs] = useState<ReadonlyMap<IsoDate, DayLog>>(new Map());
  const [backedUp, setBackedUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [logs, settings] = await Promise.all([loadDayLogs(profileId, dates), getSettings()]);
        if (cancelled) return;
        setDayLogs(logs);
        setBackedUp(settings.lastBackupAt !== undefined);
      } catch {
        // The week is a summary: if it cannot be read, the day above still works.
      }
    })();
    return () => { cancelled = true; };
  }, [profileId, dates, version]);

  const mine = useMemo(() => entries.filter((e) => e.profileId === profileId), [entries, profileId]);
  const days = useMemo(() => weekDays(dates, mine, dayLogs, ctx), [dates, mine, dayLogs, ctx]);
  const week = summariseWeek(days);
  const spent = spentBetween(batches, dates[0]!, endDate);
  const best = bestValueBetween(batches, ctx.ingredientById, shiftIso(endDate, -29), endDate);
  const yields = yieldsLearned(batches, samples);
  const reached = milestones({
    loggedDays: new Set(mine.map((e) => e.date)).size,
    weighedCooks: ctx.sessions.filter((s) => s.method !== NOT_COOKED).length,
    backedUp,
  });

  return (
    <section className="card week" aria-labelledby="week-title">
      <h3 className="card__title" id="week-title">Your last 7 days</h3>

      <ol className="week__dots" aria-label="Protein target by day">
        {days.map((d) => {
          const state = !d.logged ? 'off' : d.hitProtein ? 'hit' : 'logged';
          const said = state === 'off' ? 'nothing logged' : state === 'hit' ? 'protein target reached' : 'logged';
          return (
            <li key={d.date} className="week__day">
              <span className={`week__dot week__dot--${state}`} role="img" aria-label={`${WEEKDAY(d.date)}: ${said}`} />
              <span className="week__weekday" aria-hidden="true">{WEEKDAY(d.date).slice(0, 2)}</span>
            </li>
          );
        })}
      </ol>

      {week.loggedDays === 0 ? (
        <p className="week__line">Nothing logged in these seven days yet.</p>
      ) : (
        <>
          <p className="week__line" data-testid="week-protein">
            Protein target reached on <strong>{week.proteinHits}</strong> of the{' '}
            {week.loggedDays === 1 ? 'day' : `${week.loggedDays} days`} you logged.
          </p>
          <p className="week__line" data-testid="week-average">
            On a logged day, about {round(week.avgKcal)} of {round(week.avgKcalTarget)} kcal and{' '}
            {round(week.avgProtein)} of {round(week.avgProteinTarget)} g protein.
          </p>
        </>
      )}

      {spent > 0 && (
        <p className="week__line" data-testid="week-spent">Spent on shopping: {formatMYR(myr(spent))}</p>
      )}

      {best !== null && (
        <p className="week__line week__find" data-testid="week-best">
          Best protein for your money this month: <strong>{best.name}</strong>
          {best.location !== '' && <> at {best.location}</>}, {best.gramsPerMYR.toFixed(1)} g per RM
          {best.bestEver && <span className="week__tag">your best yet</span>}
        </p>
      )}

      {yields.cooked > 0 && (
        <p className="week__line" data-testid="week-yields">
          Yields learned from your own cooking: {yields.learned} of the {yields.cooked}{' '}
          {yields.cooked === 1 ? 'food' : 'foods'} you cook. Weigh a cook to teach the app another.
        </p>
      )}

      {reached.length > 0 && (
        <ul className="week__milestones" aria-label="Milestones">
          {reached.map((m) => <li key={m} className="week__milestone">{m}</li>)}
        </ul>
      )}
    </section>
  );
}
