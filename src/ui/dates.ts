import type { IsoDate } from '../core/types';

/**
 * Today as a local calendar date. Deliberately not `toISOString().slice(0, 10)`,
 * which is UTC: in Malaysia that reports yesterday until 8am, so a batch bought
 * at breakfast would be filed to the wrong day.
 */
export const todayIso = (now: Date = new Date()): IsoDate => {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * The parts are parsed and rebuilt locally rather than handed to `new Date(iso)`,
 * which treats a bare 'YYYY-MM-DD' as UTC midnight and so renders the previous
 * day in any negative offset.
 */
export function formatIsoDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || Number.isNaN(year)) {
    return iso;
  }
  return new Date(year, month - 1, day).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Day arithmetic through a local `Date`, which handles month, year and leap-day
 * rollover for free. Building the result with `todayIso` rather than string
 * surgery keeps it on the same local-calendar footing as every other date in
 * the app — `toISOString()` here would reintroduce the UTC bug the whole module
 * exists to avoid.
 */
export function shiftIso(iso: IsoDate, days: number): IsoDate {
  // Asserted rather than checked like formatIsoDate's parse: every caller in
  // this app only ever feeds shiftIso a value that already round-tripped
  // through todayIso, so there is no "not a date" case to fall back on here.
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return todayIso(new Date(year, month - 1, day + days));
}

export const dayName = (iso: IsoDate, today: IsoDate): string => {
  if (iso === today) return 'Today';
  if (iso === shiftIso(today, -1)) return 'Yesterday';
  return formatIsoDate(iso);
};
