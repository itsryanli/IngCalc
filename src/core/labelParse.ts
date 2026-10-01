import type { NutrientKey } from './types';

/**
 * Reads the text of a packaged food's nutrition label, as copied from a phone's
 * camera (Live Text on iPhone, Google Lens on Android), and turns it into values
 * per 100 g in the app's units: kcal, grams for macros, milligrams for minerals.
 *
 * It only proposes values. Text recognition misreads digits and columns often
 * enough that a person checks every number before it is saved, so this aims to
 * be right on well-formed labels and to say so when it had to guess.
 */

/** Which column the values were taken from. */
export type LabelBasis = 'per100g' | 'per100ml' | 'perServing' | 'assumedPer100g';

export interface LabelReading {
  /** Per 100 g. Only nutrients the label actually lists; absent means not found. */
  values: Partial<Record<NutrientKey, number>>;
  basis: LabelBasis;
  /** The serving the values were scaled from, when `basis` is 'perServing'. */
  servingGrams?: number;
  /** Things the person should check, in plain words. */
  notes: string[];
}

type Unit = 'kcal' | 'kj' | 'g' | 'mg' | 'mcg';
type Target = 'kcal' | 'g' | 'mg';

interface Row {
  key: NutrientKey | 'salt';
  match: RegExp;
  exclude?: RegExp;
  target: Target;
}

// English and Malay, the two languages on Malaysian labels. Sub-rows such as
// "of which sugars" or "saturated fat" are excluded so they cannot stand in
// for their parent row.
const SUB_ROW = /saturat|trans\b|mono|poly|tepu|of which|daripada|sugar|gula|cholesterol|kolesterol|from fat/;
const ROWS: Row[] = [
  { key: 'kcal', match: /\b(energy|tenaga|calories?|kalori)\b/, exclude: SUB_ROW, target: 'kcal' },
  { key: 'protein', match: /\bprotein\b/, target: 'g' },
  { key: 'carbs', match: /\b(carbohydrates?|karbohidrat|carbs?)\b/, exclude: SUB_ROW, target: 'g' },
  { key: 'fibre', match: /\b(fib(re|er)|serat|serabut)\b/, target: 'g' },
  { key: 'fat', match: /\b(fat|lemak)\b/, exclude: SUB_ROW, target: 'g' },
  { key: 'sodium', match: /\b(sodium|natrium)\b/, target: 'mg' },
  { key: 'salt', match: /\b(salt|garam)\b/, target: 'g' },
  { key: 'potassium', match: /\b(potassium|kalium)\b/, target: 'mg' },
  { key: 'iron', match: /\b(iron|besi)\b/, target: 'mg' },
  { key: 'magnesium', match: /\bmagnesium\b/, target: 'mg' },
  { key: 'zinc', match: /\b(zinc|zink)\b/, target: 'mg' },
  { key: 'calcium', match: /\b(calcium|kalsium)\b/, target: 'mg' },
];

const NAMES: Record<Row['key'], string> = {
  kcal: 'energy', protein: 'protein', carbs: 'carbohydrate', fibre: 'fibre', fat: 'fat',
  sodium: 'sodium', salt: 'salt', potassium: 'potassium', iron: 'iron',
  magnesium: 'magnesium', zinc: 'zinc', calcium: 'calcium',
};

const PER_100 = /(?:per|setiap|each|\/)\s*100\s*(g|ml)\b/;
const PER_SERVING = /(?:per|setiap)\s*(?:serving|serve|hidangan|sajian|portion)/;
const SERVING_LINE = /serving|hidangan|sajian|portion/;
const SERVINGS_COUNT = /servings?\s*per|hidangan\s*(?:per|setiap|bagi)\s*(?:bekas|pek|package|container)/;
const AMOUNT = /(<\s*)?(\d+(?:\.\d+)?)\s*(kcal|kj|cal|mg|mcg|µg|μg|g|%)?(?![a-z])/g;

const KJ_PER_KCAL = 4.184;
/** 1 g of salt is 0.4 g of sodium. */
const SODIUM_MG_PER_SALT_G = 400;

const round = (x: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    // Decimal commas ("12,5 g") and thousands separators ("1,046 kJ").
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    // A misread zero: "Og" or "O.5 g".
    .replace(/(?<![a-z])o(?=\.\d|\s*m?g\b)/g, '0')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
}

/** The text before the first number: where a row's name is. */
const labelPart = (line: string): string => line.split(/<?\s*\d/)[0] ?? '';

function unitHint(label: string): Unit | undefined {
  const m = /\(\s*(kcal|kj|mg|mcg|µg|μg|g)\s*\)/.exec(label);
  if (m === null) return /\bkj\b/.test(label) ? 'kj' : undefined;
  return toUnit(m[1]!);
}

function toUnit(u: string): Unit {
  if (u === 'cal') return 'kcal';
  if (u === 'µg' || u === 'μg') return 'mcg';
  return u as Unit;
}

interface Amount { value: number; unit: Unit | undefined; lessThan: boolean }

function amounts(text: string): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    if (m[3] === '%') continue; // % daily value, not an amount
    out.push({ value: Number(m[2]), unit: m[3] === undefined ? undefined : toUnit(m[3]), lessThan: m[1] !== undefined });
  }
  return out;
}

function convert(value: number, from: Unit, to: Target): number | undefined {
  if (to === 'kcal') return from === 'kj' ? value / KJ_PER_KCAL : from === 'kcal' ? value : undefined;
  if (from === 'kcal' || from === 'kj') return undefined;
  const mg = from === 'g' ? value * 1000 : from === 'mcg' ? value / 1000 : value;
  return to === 'mg' ? mg : mg / 1000;
}

function columns(lines: string[]): { index: number; count: number; basis: LabelBasis } {
  const text = lines.join('\n');
  const per100 = PER_100.exec(text);
  const perServing = PER_SERVING.exec(text);
  if (per100 === null) {
    return { index: 0, count: 1, basis: perServing !== null ? 'perServing' : 'assumedPer100g' };
  }
  const basis = per100[1] === 'ml' ? 'per100ml' : 'per100g';
  if (perServing === null) return { index: 0, count: 1, basis };
  return { index: per100.index < perServing.index ? 0 : 1, count: 2, basis };
}

function servingGrams(lines: string[]): number | undefined {
  for (const line of lines) {
    if (!SERVING_LINE.test(line) || SERVINGS_COUNT.test(line)) continue;
    const m = /(\d+(?:\.\d+)?)\s*(g|ml)\b/.exec(line.replace(new RegExp(PER_100, 'g'), ''));
    if (m !== null && Number(m[1]) > 0) return Number(m[1]);
  }
  return undefined;
}

export function parseLabel(text: string): LabelReading {
  const lines = normalise(text);
  const cols = columns(lines);
  const notes: string[] = [];
  const found: Partial<Record<Row['key'], number>> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(ingredients|bahan|ramuan)\b/.test(line)) continue;
    const label = labelPart(line);
    const row = ROWS.find((r) => r.match.test(label) && !(r.exclude?.test(label) ?? false));
    if (row === undefined || found[row.key] !== undefined) continue;

    let rest = line.slice(label.length);
    // A pasted table can come out a column at a time: the name on one line and
    // its numbers on the next.
    if (amounts(rest).length === 0) {
      const next = lines[i + 1];
      if (next === undefined || labelPart(next).trim() !== '') continue;
      rest = next;
    }

    let values = amounts(rest);
    // "1580 kJ (378 kcal)": prefer the kcal figures when both are given.
    const kcal = values.filter((a) => a.unit === 'kcal');
    if (row.target === 'kcal' && kcal.length > 0) values = kcal;

    const picked = values.length >= cols.count ? values[cols.index]! : values[0]!;
    if (values.length < cols.count) notes.push(`Only one value was found for ${NAMES[row.key]}; check it is from the right column.`);
    const value = convert(picked.value, picked.unit ?? unitHint(label) ?? row.target, row.target);
    if (value === undefined) continue;
    if (picked.lessThan) notes.push(`The label gives ${NAMES[row.key]} as "less than"; the upper limit was used.`);
    found[row.key] = value;
  }

  if (found.sodium === undefined && found.salt !== undefined) {
    found.sodium = found.salt * SODIUM_MG_PER_SALT_G;
    notes.push('Sodium was worked out from salt (salt ÷ 2.5).');
  }
  delete found.salt;

  let scale = 1;
  let serving: number | undefined;
  if (cols.basis === 'perServing') {
    serving = servingGrams(lines);
    if (serving === undefined) {
      notes.push('These values are per serving, but no serving size in grams was found, so they were not converted to per 100 g. Enter them per 100 g yourself.');
    } else {
      scale = 100 / serving;
    }
  } else if (cols.basis === 'per100ml') {
    notes.push('The label gives values per 100 ml; they were used as per 100 g, which is close for milk and other watery drinks.');
  } else if (cols.basis === 'assumedPer100g') {
    notes.push('No "per 100 g" or "per serving" heading was found, so the values were taken as per 100 g.');
  }

  const values: LabelReading['values'] = {};
  for (const [k, v] of Object.entries(found) as [NutrientKey, number][]) {
    values[k] = round(v * scale, k === 'kcal' ? 0 : 2);
  }

  const { kcal, protein, carbs, fat, fibre } = values;
  const mass = (protein ?? 0) + (carbs ?? 0) + (fat ?? 0) + (fibre ?? 0);
  if (mass > 100) notes.push('Protein, carbohydrate, fat and fibre add up to more than 100 g per 100 g; a value or column was probably misread.');
  if (kcal !== undefined && protein !== undefined && carbs !== undefined && fat !== undefined) {
    const expected = 4 * protein + 4 * carbs + 9 * fat;
    if (Math.abs(expected - kcal) > Math.max(25, 0.2 * kcal)) {
      notes.push(`Energy (${kcal} kcal) doesn't match protein, carbohydrate and fat (about ${Math.round(expected)} kcal); a value or column was probably misread.`);
    }
  }

  return serving === undefined
    ? { values, basis: cols.basis, notes }
    : { values, basis: cols.basis, servingGrams: serving, notes };
}
