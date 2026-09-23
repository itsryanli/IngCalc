import {
  CATEGORIES, COOK_METHODS, GOALS, LANDING_TABS, MEAL_LABEL_KEYS, NUTRIENT_KEYS, SEXES,
  WEIGHT_UNITS,
  type Batch, type CookSession, type DayLog, type Ingredient, type MealEntry, type Profile,
  type Settings,
} from './types';

export const BACKUP_APP = 'ingcalc';
/** Must equal the highest `this.version(n)` in `storage/db.ts`; a test asserts it. */
export const CURRENT_SCHEMA_VERSION = 3;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_MESSAGE_LINES = 5;

export const NOT_READABLE = "This isn't a readable backup file.";
export const NOT_OURS = "This isn't an IngCalc backup.";
export const TOO_NEW = 'This backup was made by a newer version of IngCalc. Update the app, then restore.';
export const TOO_LARGE = 'That file is too large to be an IngCalc backup.';

export const TABLE_NAMES = [
  'profiles', 'userIngredients', 'settings', 'batches', 'cookSessions', 'mealEntries', 'dayLogs',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export interface BackupTables {
  profiles: Profile[];
  userIngredients: Ingredient[];
  settings: Settings[];
  batches: Batch[];
  cookSessions: CookSession[];
  mealEntries: MealEntry[];
  dayLogs: DayLog[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  /** An instant, informational only. */
  exportedAt: string;
  tables: BackupTables;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const emptyTables = (): BackupTables => ({
  profiles: [], userIngredients: [], settings: [], batches: [], cookSessions: [],
  mealEntries: [], dayLogs: [],
});

export function makeBackup(tables: BackupTables, now: Date): BackupFile {
  // `toISOString` is right here and nowhere else in the app: this is the
  // instant the file was made, not a calendar date.
  return { app: BACKUP_APP, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

// ---------------------------------------------------------------------------
// Reporting: problems are collected, counted, and phrased for a person.

/** A problem phrased for one row and for many, so no string surgery pluralises it. */
export type Phrase = readonly [one: string, many: string];

export interface Problems {
  add: (phrase: Phrase) => void;
  line: (text: string) => void;
  empty: () => boolean;
  lines: () => string[];
}

/**
 * One corrupt row rejects the whole file, but the person restoring it deserves
 * to know how bad it is: "3 meal entries have an invalid date", not the first
 * of the three.
 */
export function problems(): Problems {
  const counted = new Map<string, { phrase: Phrase; n: number }>();
  const single: string[] = [];
  return {
    add: (phrase) => {
      const hit = counted.get(phrase[1]);
      if (hit === undefined) counted.set(phrase[1], { phrase, n: 1 });
      else hit.n += 1;
    },
    line: (text) => { single.push(text); },
    empty: () => counted.size === 0 && single.length === 0,
    lines: () => {
      const all = [
        ...[...counted.values()].map(({ phrase, n }) => `${n} ${n === 1 ? phrase[0] : phrase[1]}.`),
        ...single,
      ];
      if (all.length <= MAX_MESSAGE_LINES) return all;
      const shown = MAX_MESSAGE_LINES - 1;
      return [...all.slice(0, shown), `…and ${all.length - shown} more problems.`];
    },
  };
}

export const NOUNS: Record<TableName, Phrase> = {
  profiles: ['profile', 'profiles'],
  userIngredients: ['added ingredient', 'added ingredients'],
  settings: ['settings row', 'settings rows'],
  batches: ['purchase', 'purchases'],
  cookSessions: ['cook', 'cooks'],
  mealEntries: ['meal entry', 'meal entries'],
  dayLogs: ['day record', 'day records'],
};

const invalid = (table: TableName, label: string): Phrase =>
  [`${NOUNS[table][0]} has an invalid ${label}`, `${NOUNS[table][1]} have an invalid ${label}`];

// ---------------------------------------------------------------------------
// Predicates. Every one takes `unknown`: this is the boundary where stored
// types stop being a promise and start being a claim.

type Row = Record<string, unknown>;

const isRecord = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
const isName = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const isPositive = (v: unknown): boolean => isFiniteNumber(v) && v > 0;
const isNonNegative = (v: unknown): boolean => isFiniteNumber(v) && v >= 0;
const isOptional = (check: (v: unknown) => boolean) => (v: unknown): boolean =>
  v === undefined || check(v);
const isOneOf = (list: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && list.includes(v);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Shape AND calendar: '2026-02-30' has the shape and is not a day. */
export function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= (m === 2 && leap ? 29 : DAYS_IN_MONTH[m - 1]!);
}

const sub = (v: unknown): Row => (isRecord(v) ? v : {});

// ---------------------------------------------------------------------------
// Row specs: [what the person is told is wrong, the check].

type Spec = readonly [label: string, check: (row: Row) => boolean];

const ID: Spec = ['id', (r) => isId(r.id)];
const CREATED: Spec = ['creation time', (r) => isFiniteNumber(r.createdAt)];

const SPECS: Record<Exclude<TableName, 'mealEntries'>, readonly Spec[]> = {
  profiles: [
    ID,
    ['name', (r) => isName(r.name)],
    ['sex', (r) => isOneOf(SEXES)(r.sex)],
    ['birth year', (r) => Number.isInteger(r.birthYear)],
    ['height', (r) => isPositive(r.heightCm)],
    ['weight', (r) => isPositive(r.weightKg)],
    ['sessions per week', (r) => isNonNegative(r.sessionsPerWeek)],
    ['goal', (r) => isOneOf(GOALS)(r.goal)],
    ['protein target', (r) => isOptional(isPositive)(r.proteinGPerKg)],
  ],
  userIngredients: [
    ID,
    ['name', (r) => isName(r.name)],
    ['category', (r) => isOneOf(CATEGORIES)(r.category)],
    ['nutrients', (r) => isRecord(r.per100gRaw)
      && NUTRIENT_KEYS.every((k) => isNonNegative(sub(r.per100gRaw)[k]))],
    ['published yields', (r) => isRecord(r.publishedYield)
      && Object.entries(r.publishedYield).every(([k, f]) => isOneOf(COOK_METHODS)(k) && isPositive(f))],
    ['water absorption', (r) => typeof r.absorbsWater === 'boolean'],
    // Built-in ingredients are code, not data: a backup can only carry the user's own.
    ['source', (r) => r.source === 'user'],
    ['source reference', (r) => isOptional((v) => typeof v === 'string')(r.sourceRef)],
    ['archived flag', (r) => typeof r.archived === 'boolean'],
  ],
  settings: [
    ['id', (r) => r.id === 'singleton'],
    ['active profile', (r) => r.activeProfileId === null || isId(r.activeProfileId)],
    ['landing tab', (r) => isOneOf(LANDING_TABS)(r.landingTab)],
    ['weight unit', (r) => isOneOf(WEIGHT_UNITS)(r.defaultWeightUnit)],
  ],
  batches: [
    ID,
    ['ingredient', (r) => isId(r.ingredientId)],
    ['weight', (r) => isPositive(r.rawWeightG)],
    ['price', (r) => isNonNegative(sub(r.purchase).pricePaidMYR)],
    ['location', (r) => typeof sub(r.purchase).location === 'string'],
    ['date', (r) => isIsoDate(sub(r.purchase).date)],
    CREATED,
  ],
  cookSessions: [
    ID,
    ['purchase', (r) => isId(r.batchId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['raw weight', (r) => isPositive(r.rawUsedG)],
    ['cooked weight', (r) => isPositive(r.cookedWeightG)],
    ['date', (r) => isIsoDate(r.cookedAt)],
    ['portion count', (r) => Number.isInteger(r.portionCount) && (r.portionCount as number) >= 1],
    ['calibration flag', (r) => typeof r.excludeFromCalibration === 'boolean'],
  ],
  dayLogs: [
    ID,
    ['profile', (r) => isId(r.profileId)],
    ['date', (r) => isIsoDate(r.date)],
    ['profile-and-date id', (r) => r.id === `${String(r.profileId)}:${String(r.date)}`],
    ['calorie target', (r) => isNonNegative(sub(r.targets).kcal)],
    ['protein target', (r) => isNonNegative(sub(r.targets).proteinG)],
    ['nutrient targets', (r) => isRecord(sub(r.targets).micros)
      && Object.values(sub(sub(r.targets).micros)).every((m) => isRecord(m)
        && isOptional(isNonNegative)(m.rni) && isOptional(isNonNegative)(m.dv))],
  ],
};

const ENTRY_BASE: readonly Spec[] = [
  ID,
  ['profile', (r) => isId(r.profileId)],
  ['date', (r) => isIsoDate(r.date)],
  ['meal', (r) => isOneOf(MEAL_LABEL_KEYS)(r.label)],
  CREATED,
];

const ENTRY_KINDS: Record<MealEntry['kind'], readonly Spec[]> = {
  portion: [['cook', (r) => isId(r.cookSessionId)], ['portion count', (r) => isPositive(r.portions)]],
  weight: [['cook', (r) => isId(r.cookSessionId)], ['weight', (r) => isPositive(r.grams)]],
  ingredient: [
    ['ingredient', (r) => isId(r.ingredientId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['weight', (r) => isPositive(r.cookedG)],
  ],
  quick: [
    ['name', (r) => isName(r.name)],
    ['calorie figure', (r) => isPositive(r.kcal)],
    ['protein figure', (r) => isOptional(isNonNegative)(r.proteinG)],
  ],
};

function specsFor(table: TableName, row: Row): readonly Spec[] {
  if (table !== 'mealEntries') return SPECS[table];
  // `hasOwn`, not `in`: `'toString' in ENTRY_KINDS` is true.
  const kind = row.kind;
  if (typeof kind === 'string' && Object.hasOwn(ENTRY_KINDS, kind)) {
    return [...ENTRY_BASE, ...ENTRY_KINDS[kind as MealEntry['kind']]];
  }
  return [...ENTRY_BASE, ['kind', () => false]];
}

const fail = (error: string): Result<never> => ({ ok: false, errors: [error] });

/**
 * Steps 2–4 of the restore pipeline (spec §5.3): parse, envelope, rows.
 * Nothing here knows what is on the device. That is `planRestore`'s job, because
 * the integrity of a merge depends on it.
 */
export function parseBackup(text: string): Result<BackupTables> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(NOT_READABLE);
  }

  if (!isRecord(data) || data.app !== BACKUP_APP || !isRecord(data.tables)) return fail(NOT_OURS);
  const version = data.schemaVersion;
  if (!Number.isInteger(version) || (version as number) < 1) return fail(NOT_OURS);
  if ((version as number) > CURRENT_SCHEMA_VERSION) return fail(TOO_NEW);

  const found = problems();
  const out = emptyTables();

  for (const table of TABLE_NAMES) {
    const rows = data.tables[table];
    // Schema v1 → v3 only ever added tables, so an older file lacks some.
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      found.line(`The backup's ${NOUNS[table][1]} are not a list.`);
      continue;
    }

    const seen = new Set<unknown>();
    for (const row of rows) {
      if (!isRecord(row)) {
        found.add(invalid(table, 'format'));
        continue;
      }
      for (const [label, check] of specsFor(table, row)) {
        if (!check(row)) found.add(invalid(table, label));
      }
      if (seen.has(row.id)) {
        found.add([`${NOUNS[table][0]} has the same id as another`, `${NOUNS[table][1]} have the same id as another`]);
      }
      seen.add(row.id);
    }
    if (table === 'settings' && rows.length > 1) found.line('The backup has more than one settings row.');

    // Every row of this table has just been checked field by field; that is
    // what licenses treating the array as the table's type.
    (out as Record<TableName, unknown[]>)[table] = rows;
  }

  return found.empty() ? { ok: true, value: out } : { ok: false, errors: found.lines() };
}
