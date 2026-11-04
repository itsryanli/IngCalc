import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MealContext } from '../../core/meals';
import { NOT_COOKED, type Batch, type DayLog, type IsoDate, type MealEntry, type YieldSample } from '../../core/types';
import { formatMYR, myr } from '../../core/units';
import {
  bestValueBetween, milestones, savingsBetween, spentBetween, STREAK_DAYS, summariseWeek,
  varietyBetween, weekDays, weeklyStreak, yieldsLearned, type WeeklyStreak,
} from '../../core/week';
import { loadDayLogs } from '../../storage/meals';
import { getSettings } from '../../storage/settings';
import { shiftIso } from '../dates';

const WEEKDAY = (iso: IsoDate): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-MY', { weekday: 'short' });
};

const round = (n: number) => Math.round(n).toLocaleString('en-MY');

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C", or "A, B, C and 2 more". */
function listNames(names: readonly string[], max = 3): string {
  if (names.length <= max) {
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/**
 * Only ever encouraging. Quiet when the week cannot reach the target any more,
 * rather than announcing that a streak is about to end.
 */
function StreakLine({ streak }: { streak: WeeklyStreak }) {
  const goal = `${STREAK_DAYS} or more days logged`;
  const line = (body: ReactNode) => <p className="week__line week__streak" data-testid="week-streak">{body}</p>;
  if (streak.thisWeekCounts) {
    return streak.weeks === 1
      ? line(<><strong>This week</strong> has {goal}. Do it again next week to start a streak.</>)
      : line(<><strong>{streak.weeks} weeks</strong> in a row with {goal}.</>);
  }
  if (!streak.reachable) return null;
  const more = plural(streak.needed, 'more day', 'more days');
  if (streak.weeks === 1) {
    return line(<>Last week had {goal}. Log {more} this week to make it <strong>2 in a row</strong>.</>);
  }
  if (streak.weeks > 1) {
    return line(<><strong>{streak.weeks} weeks</strong> in a row with {goal}. Log {more} this week
      to make it {streak.weeks + 1}.</>);
  }
  if (streak.thisWeekLogged === 0) return null;
  return line(<>Log {more} this week to reach {STREAK_DAYS} days and start a weekly streak.</>);
}

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
 * grey dot. The weekly streak only asks for a few logged days a week, and says
 * nothing at all rather than scold when a week falls short.
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
  const streak = useMemo(() => weeklyStreak(mine.map((e) => e.date), endDate), [mine, endDate]);
  const variety = useMemo(() => varietyBetween(mine, ctx, dates[0]!, endDate), [mine, ctx, dates, endDate]);
  const savings = savingsBetween(batches, ctx.ingredientById, dates[0]!, endDate);
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

      <StreakLine streak={streak} />

      {variety.foods > 0 && (
        <p className="week__line" data-testid="week-variety">
          You ate <strong>{plural(variety.foods, 'different food')}</strong>
          {variety.plants > 0 && <>, {variety.plants} of them plants (vegetables, fruit, grains, beans and nuts)</>}.
        </p>
      )}

      {variety.newFoods.length > 0 && (
        <p className="week__line" data-testid="week-new">
          New to your plate: {listNames(variety.newFoods)}
          <span className="week__tag">{variety.newFoods.length === 1 ? 'new' : `${variety.newFoods.length} new`}</span>
        </p>
      )}

      {spent > 0 && (
        <p className="week__line" data-testid="week-spent">Spent on shopping: {formatMYR(myr(spent))}</p>
      )}

      {savings !== null && savings.savedMYR >= 0.5 && (
        <p className="week__line week__find" data-testid="week-saved">
          You paid <strong>{formatMYR(myr(savings.savedMYR))}</strong> less than your usual prices for the same foods.
          {savings.bestDeal !== null && (
            <> Best find: <strong>{savings.bestDeal.name}</strong>
              {savings.bestDeal.location !== '' && <> at {savings.bestDeal.location}</>},{' '}
              {Math.round(savings.bestDeal.fractionBelow * 100)}% under your usual.</>
          )}
        </p>
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
