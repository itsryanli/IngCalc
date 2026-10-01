import { useEffect, useState } from 'react';
import { dayTotals, type MealContext } from '../../core/meals';
import { snapshotTargets } from '../../core/targets';
import type { IsoDate, Profile, ProfileGroup } from '../../core/types';
import { DV_US } from '../../data/dvUS';
import { rniFor } from '../../data/rniMY';
import { loadDay } from '../../storage/meals';
import { todayIso } from '../dates';

interface Row {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  kcalTarget: number;
  proteinTarget: number;
  /** A quick entry left protein blank, so the figure is a floor. */
  proteinFloor: boolean;
}

interface Props {
  group: ProfileGroup;
  profiles: readonly Profile[];
  date: IsoDate;
  ctx: MealContext;
  today: Date;
  /** Bumped by the Log after any change, so the overview re-reads. */
  version: number;
}

const n = (v: number) => Math.round(v).toLocaleString('en-MY');
const pct = (v: number, t: number) => (t > 0 ? Math.min(100, Math.max(0, (v / t) * 100)) : 0);

/**
 * Everyone in a group on one day, side by side: calories and protein against
 * each person's own targets. Read-only — each row is that person's own Log.
 */
export function GroupDay({ group, profiles, date, ctx, today, version }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  // The Log hands in a fresh Date on every render; keying the effect on the
  // calendar day instead keeps it from re-reading (and re-rendering) forever.
  const todayKey = todayIso(today);

  useEffect(() => {
    let live = true;
    // Local midnight of the same calendar day: all the targets need is the age.
    const asOf = new Date(`${todayKey}T00:00:00`);
    const members = group.memberIds
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is Profile => p !== undefined);

    Promise.all(members.map(async (p) => {
      const { entries, dayLog } = await loadDay(p.id, date);
      // A day not yet logged is measured against today's targets, as on the Log itself.
      const targets = dayLog?.targets ?? snapshotTargets(p, asOf, rniFor, DV_US);
      const totals = dayTotals(entries, ctx);
      return {
        id: p.id, name: p.name,
        kcal: totals.totals.kcal, protein: totals.totals.protein,
        kcalTarget: targets.kcal, proteinTarget: targets.proteinG,
        proteinFloor: totals.unknownProteinEntries > 0,
      };
    }))
      .then((loaded) => { if (live) setRows(loaded); })
      .catch((err: unknown) => {
        console.error('Loading the group day failed', err);
        if (live) setRows(null);
      });
    return () => { live = false; };
  }, [group, profiles, date, ctx, todayKey, version]);

  if (rows === null) return null;

  return (
    <section className="card group-day" data-testid={`group-day-${group.id}`} aria-label={`${group.name} today`}>
      <h3 className="card__title">{group.name}</h3>
      <ul className="group-day__list">
        {rows.map((r) => (
          <li key={r.id} className="group-day__row" data-testid={`group-day-${r.id}`}>
            <p className="item-name">{r.name}</p>
            <p className="group-day__figure">
              {n(r.kcal)} / {n(r.kcalTarget)} kcal
            </p>
            <div className="progress__track" aria-hidden="true">
              <div className="progress__bar" style={{ width: `${pct(r.kcal, r.kcalTarget)}%` }} />
            </div>
            <p className={`group-day__figure${r.proteinFloor ? ' progress__line--estimate' : ''}`}>
              {r.proteinFloor && 'at least '}{n(r.protein)} / {n(r.proteinTarget)}g protein
            </p>
            <div className="progress__track" aria-hidden="true">
              <div className="progress__bar" style={{ width: `${pct(r.protein, r.proteinTarget)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
