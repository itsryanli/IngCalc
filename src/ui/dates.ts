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
