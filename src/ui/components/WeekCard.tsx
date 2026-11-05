import { useEffect, useMemo, useState } from 'react';
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

/**
 * "A · B · C", or "A · B · C · 2 more". A dot, not commas, because food names
 * often carry their own ("Chicken egg, whole, raw").
 */
function listNames(names: readonly string[], max = 3): string {
  const shown = names.slice(0, max);
  return names.length > max ? [...shown, `${names.length - max} more`].join(' · ') : shown.join(' · ');
}

/**
 * A nudge only while this week can still count, and only once something has
 * been logged: never a message that a streak is about to end.
 */
function StreakNudge({ streak }: { streak: WeeklyStreak }) {
  if (streak.thisWeekCounts || !streak.reachable) return null;
  if (streak.weeks === 0 && streak.thisWeekLogged === 0) return null;
  const more = plural(streak.needed, 'more day', 'more days');
  return (
    <p className="week__line" data-testid="week-streak-nudge">
      Log {more} this week to {streak.weeks > 0 ? 'keep your streak' : 'start a weekly streak'}.
    </p>
  );
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

  const saved = savings !== null && savings.savedMYR >= 0.5 ? savings : null;

  return (
    <section className="card week" aria-labelledby="week-title">
      <div className="week__head">
        <h3 className="card__title week__title" id="week-title">Your last 7 days</h3>
        {streak.weeks > 0 && (
          <span
            className="week__streak"
            data-testid="week-streak"
            title={`Weeks in a row with ${STREAK_DAYS} or more days logged`}
          >
            🔥 {streak.weeks}-week streak
          </span>
        )}
      </div>

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
        <ul className="week__stats" aria-label="This week">
          <li className="week__stat" data-testid="week-protein">
            <strong>{week.proteinHits}/{week.loggedDays}</strong> days protein reached
          </li>
          {variety.foods > 0 && (
            <li className="week__stat" data-testid="week-variety">
              <strong>{variety.foods}</strong> {variety.foods === 1 ? 'food' : 'foods'}
              {variety.plants > 0 && <>, <strong>{variety.plants}</strong> {variety.plants === 1 ? 'plant' : 'plants'}</>}
            </li>
          )}
          {saved !== null && (
            <li className="week__stat" data-testid="week-saved">
              <strong>{formatMYR(myr(saved.savedMYR))}</strong> saved
            </li>
          )}
        </ul>
      )}

      <StreakNudge streak={streak} />

      <details className="week__more">
        <summary>More about your week</summary>

        {week.loggedDays > 0 && (
          <p className="week__line" data-testid="week-average">
            On a logged day, about {round(week.avgKcal)} of {round(week.avgKcalTarget)} kcal and{' '}
            {round(week.avgProtein)} of {round(week.avgProteinTarget)} g protein.
          </p>
        )}

        <p className="week__line">
          Streak: a week counts with {STREAK_DAYS} or more days logged. A missed day never breaks it.
        </p>

        {variety.plants > 0 && (
          <p className="week__line">Plants are vegetables, fruit, grains, beans and nuts.</p>
        )}

        {variety.newFoods.length > 0 && (
          <p className="week__line" data-testid="week-new">New to your plate: {listNames(variety.newFoods)}</p>
        )}

        {spent > 0 && (
          <p className="week__line" data-testid="week-spent">Spent on shopping: {formatMYR(myr(spent))}</p>
        )}

        {saved !== null && (
          <p className="week__line" data-testid="week-saved-detail">
            You paid {formatMYR(myr(saved.savedMYR))} less than your usual prices for the same foods.
            {saved.bestDeal !== null && (
              <> Best find: {saved.bestDeal.name}
                {saved.bestDeal.location !== '' && <> at {saved.bestDeal.location}</>},{' '}
                {Math.round(saved.bestDeal.fractionBelow * 100)}% under your usual.</>
            )}
          </p>
        )}

        {best !== null && (
          <p className="week__line" data-testid="week-best">
            Best protein for your money this month: {best.name}
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
      </details>
    </section>
  );
}
