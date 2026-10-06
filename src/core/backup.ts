import {
  CATEGORIES, COOK_METHODS, GOALS, LANDING_TABS, MEAL_LABEL_KEYS, NUTRIENT_KEYS, SEXES,
  WEIGHT_UNITS,
  type Batch, type CookSession, type DayLog, type Ingredient, type MealEntry, type Profile,
  type ProfileGroup, type Settings,
} from './types';
import { consumedFromSession, EPSILON, isSessionEntry, sessionsOf } from './batch';
import { ingredientLookup, UNKNOWN_INGREDIENT } from './costs';

export const BACKUP_APP = 'ingcalc';
/** Must equal the highest `this.version(n)` in `storage/db.ts`; a test asserts it. */
export const CURRENT_SCHEMA_VERSION = 4;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_MESSAGE_LINES = 5;

export const NOT_READABLE = "This isn't a readable backup file.";
export const NOT_OURS = "This isn't an IngCalc backup.";
export const TOO_NEW = 'This backup was made by a newer version of IngCalc. Update the app, then restore.';
export const TOO_LARGE = 'That file is too large to be an IngCalc backup.';

export const TABLE_NAMES = [
  'profiles', 'userIngredients', 'settings', 'batches', 'cookSessions', 'mealEntries', 'dayLogs',
  'groups',
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
  groups: ProfileGroup[];
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
  mealEntries: [], dayLogs: [], groups: [],
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
  groups: ['group', 'groups'],
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

/**
 * Composes onto a passing check to add an upper bound, so a hand-edited
 * backup carrying an absurd-but-finite number (1e308) is rejected too, rather
 * than surviving every guard and blowing up `summarise` after restore. `v`
 * may be `undefined` here (an optional field the inner check already let
 * through), which is left alone rather than failing the `<= max` compare.
 */
const bounded = (check: (v: unknown) => boolean, max: number) => (v: unknown): boolean =>
  check(v) && (typeof v !== 'number' || v <= max);

/** The one weight bound every gram field in a backup shares. */
export const MAX_BACKUP_GRAMS = 1_000_000;
const MAX_PRICE_MYR = 1_000_000;
const MAX_PORTIONS = 1000;
const MAX_KCAL = 100_000;
const MAX_PROTEIN_G = 10_000;
const MAX_NUTRIENT = 100_000;
const MAX_YIELD_FACTOR = 10;
const MAX_HEIGHT_CM = 300;
const MAX_WEIGHT_KG = 1000;
const MAX_SESSIONS_PER_WEEK = 100;
const MAX_PROTEIN_G_PER_KG = 10;
const MAX_TARGET = 1_000_000;

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
    ['height', (r) => bounded(isPositive, MAX_HEIGHT_CM)(r.heightCm)],
    ['weight', (r) => bounded(isPositive, MAX_WEIGHT_KG)(r.weightKg)],
    ['sessions per week', (r) => bounded(isNonNegative, MAX_SESSIONS_PER_WEEK)(r.sessionsPerWeek)],
    ['goal', (r) => isOneOf(GOALS)(r.goal)],
    ['protein target', (r) => bounded(isOptional(isPositive), MAX_PROTEIN_G_PER_KG)(r.proteinGPerKg)],
  ],
  userIngredients: [
    ID,
    ['name', (r) => isName(r.name)],
    ['category', (r) => isOneOf(CATEGORIES)(r.category)],
    ['nutrients', (r) => isRecord(r.per100gRaw)
      && NUTRIENT_KEYS.every((k) => bounded(isNonNegative, MAX_NUTRIENT)(sub(r.per100gRaw)[k]))],
    ['published yields', (r) => isRecord(r.publishedYield)
      && Object.entries(r.publishedYield)
        .every(([k, f]) => isOneOf(COOK_METHODS)(k) && bounded(isPositive, MAX_YIELD_FACTOR)(f))],
    ['water absorption', (r) => typeof r.absorbsWater === 'boolean'],
    ['usual cooking method', (r) => isOptional(isOneOf(COOK_METHODS))(r.defaultMethod)],
    ['unknown nutrients', (r) => isOptional((v) => Array.isArray(v) && v.every(isOneOf(NUTRIENT_KEYS)))(r.unknownNutrients)],
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
    ['last backup time', (r) => isOptional(isNonNegative)(r.lastBackupAt)],
  ],
  batches: [
    ID,
    ['ingredient', (r) => isId(r.ingredientId)],
    ['weight', (r) => bounded(isPositive, MAX_BACKUP_GRAMS)(r.rawWeightG)],
    ['price', (r) => bounded(isNonNegative, MAX_PRICE_MYR)(sub(r.purchase).pricePaidMYR)],
    ['location', (r) => typeof sub(r.purchase).location === 'string'],
    ['date', (r) => isIsoDate(sub(r.purchase).date)],
    ['shopping trip', (r) => isOptional(isId)(sub(r.purchase).tripId)],
    CREATED,
  ],
  cookSessions: [
    ID,
    ['purchase', (r) => isId(r.batchId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['raw weight', (r) => bounded(isPositive, MAX_BACKUP_GRAMS)(r.rawUsedG)],
    ['cooked weight', (r) => bounded(isPositive, MAX_BACKUP_GRAMS)(r.cookedWeightG)],
    ['date', (r) => isIsoDate(r.cookedAt)],
    ['portion count', (r) => Number.isInteger(r.portionCount)
      && (r.portionCount as number) >= 1 && (r.portionCount as number) <= MAX_PORTIONS],
    ['calibration flag', (r) => typeof r.excludeFromCalibration === 'boolean'],
  ],
  dayLogs: [
    ID,
    ['profile', (r) => isId(r.profileId)],
    ['date', (r) => isIsoDate(r.date)],
    ['profile-and-date id', (r) => r.id === `${String(r.profileId)}:${String(r.date)}`],
    ['calorie target', (r) => bounded(isNonNegative, MAX_TARGET)(sub(r.targets).kcal)],
    ['protein target', (r) => bounded(isNonNegative, MAX_TARGET)(sub(r.targets).proteinG)],
    ['nutrient targets', (r) => isRecord(sub(r.targets).micros)
      && Object.values(sub(sub(r.targets).micros)).every((m) => isRecord(m)
        && bounded(isOptional(isNonNegative), MAX_TARGET)(m.rni)
        && bounded(isOptional(isNonNegative), MAX_TARGET)(m.dv))],
  ],
  groups: [
    ID,
    ['name', (r) => isName(r.name)],
    ['member list', (r) => Array.isArray(r.memberIds) && r.memberIds.length > 0
      && r.memberIds.every(isId) && new Set(r.memberIds).size === r.memberIds.length],
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
  portion: [
    ['cook', (r) => isId(r.cookSessionId)],
    ['portion count', (r) => bounded(isPositive, MAX_PORTIONS)(r.portions)],
  ],
  weight: [
    ['cook', (r) => isId(r.cookSessionId)],
    ['weight', (r) => bounded(isPositive, MAX_BACKUP_GRAMS)(r.grams)],
  ],
  ingredient: [
    ['ingredient', (r) => isId(r.ingredientId)],
    ['cooking method', (r) => isOneOf(COOK_METHODS)(r.method)],
    ['weight', (r) => bounded(isPositive, MAX_BACKUP_GRAMS)(r.cookedG)],
  ],
  quick: [
    ['name', (r) => isName(r.name)],
    ['calorie figure', (r) => bounded(isPositive, MAX_KCAL)(r.kcal)],
    ['protein figure', (r) => bounded(isOptional(isNonNegative), MAX_PROTEIN_G)(r.proteinG)],
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
    // Schema v1 → v4 only ever added tables, so an older file lacks some.
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

// ---------------------------------------------------------------------------
// Integrity: run over the dataset a restore WOULD produce (spec §5.3 step 5).

/**
 * Every row can be valid alone and the set still be broken: a cook whose
 * purchase is missing, or backup meals landing on the device's copy of a cook
 * and eating more than it held. The second is the one a merge creates, and
 * no row-level check can see it.
 *
 * The lifecycle checks use `core/batch.ts`'s own helpers and `EPSILON`, so
 * "over-eaten" means exactly what it means everywhere else in the app.
 */
export function checkIntegrity(t: BackupTables, bundled: readonly Ingredient[], where: string): string[] {
  const found = problems();
  const ingredientById = ingredientLookup(bundled, t.userIngredients);
  const profileIds = new Set(t.profiles.map((p) => p.id));
  const batchById = new Map(t.batches.map((b) => [b.id, b]));
  const sessionIds = new Set(t.cookSessions.map((s) => s.id));

  const missing = (one: string, many: string): Phrase =>
    [`${one} that isn't in ${where}`, `${many} that aren't in ${where}`];

  for (const s of t.cookSessions) {
    if (!batchById.has(s.batchId)) found.add(missing('cook refers to a purchase', 'cooks refer to purchases'));
  }
  for (const b of t.batches) {
    if (ingredientById(b.ingredientId) === undefined) {
      found.add(missing('purchase refers to an ingredient', 'purchases refer to ingredients'));
    }
  }
  const bySession = new Map<string, MealEntry[]>();
  for (const e of t.mealEntries) {
    if (!profileIds.has(e.profileId)) found.add(missing('meal entry refers to a profile', 'meal entries refer to profiles'));
    if (isSessionEntry(e)) {
      if (!sessionIds.has(e.cookSessionId)) found.add(missing('meal entry refers to a cook', 'meal entries refer to cooks'));
      bySession.set(e.cookSessionId, [...(bySession.get(e.cookSessionId) ?? []), e]);
    }
    if (e.kind === 'ingredient' && ingredientById(e.ingredientId) === undefined) {
      found.add(missing('meal entry refers to an ingredient', 'meal entries refer to ingredients'));
    }
  }
  for (const d of t.dayLogs) {
    if (!profileIds.has(d.profileId)) found.add(missing('day record refers to a profile', 'day records refer to profiles'));
  }
  for (const gr of t.groups) {
    if (gr.memberIds.some((id) => !profileIds.has(id))) {
      found.add(missing('group includes a profile', 'groups include profiles'));
    }
  }

  const nameOf = (b: Batch | undefined): string =>
    (b === undefined ? undefined : ingredientById(b.ingredientId)?.name) ?? UNKNOWN_INGREDIENT;

  for (const b of t.batches) {
    const used = sessionsOf(b.id, t.cookSessions).reduce((sum, s) => sum + s.rawUsedG, 0);
    if (used > b.rawWeightG + EPSILON) {
      found.line(`The ${nameOf(b)} bought on ${b.purchase.date} has more cooked from it than was bought.`);
    }
  }
  for (const s of t.cookSessions) {
    if (consumedFromSession(s, bySession.get(s.id) ?? []) > s.cookedWeightG + EPSILON) {
      found.line(`More was eaten from the ${nameOf(batchById.get(s.batchId))} cooked on ${s.cookedAt} than the cook produced.`);
    }
  }

  return found.lines();
}

// ---------------------------------------------------------------------------
// Planning.

export type RestoreMode = 'replace' | 'merge';

export interface TableCounts {
  incoming: number;
  added: number;
  alreadyPresent: number;
  erased: number;
}

export interface RestorePlan {
  mode: RestoreMode;
  perTable: Record<TableName, TableCounts>;
  /** Exactly the rows to write; for replace, after clearing every table. */
  toWrite: BackupTables;
}

/**
 * A dangling active profile is harmless (`useProfiles` falls back to the
 * first profile), so it is repaired rather than failing the whole restore.
 */
function withResolvableActiveProfile(t: BackupTables): BackupTables {
  const ids = new Set(t.profiles.map((p) => p.id));
  return {
    ...t,
    settings: t.settings.map((s) =>
      (s.activeProfileId !== null && !ids.has(s.activeProfileId) ? { ...s, activeProfileId: null } : s)),
  };
}

const onlyNew = <T extends { id: string }>(device: readonly T[], incoming: readonly T[]): T[] => {
  const have = new Set(device.map((r) => r.id));
  return incoming.filter((r) => !have.has(r.id));
};

/**
 * Merge is add-only: a row whose id the device already has is skipped, so a
 * merge can never modify or delete anything. Rows carry no `updatedAt`, so
 * "the newer one" is unknowable; replace is the tool for rolling back. The
 * device's settings, and its frozen day-log targets, are always kept.
 */
export function planRestore(
  mode: RestoreMode,
  backup: BackupTables,
  device: BackupTables,
  bundled: readonly Ingredient[],
): Result<RestorePlan> {
  let toWrite: BackupTables;
  let resulting: BackupTables;

  if (mode === 'replace') {
    toWrite = withResolvableActiveProfile(backup);
    resulting = toWrite;
  } else {
    toWrite = {
      profiles: onlyNew(device.profiles, backup.profiles),
      userIngredients: onlyNew(device.userIngredients, backup.userIngredients),
      settings: [],
      batches: onlyNew(device.batches, backup.batches),
      cookSessions: onlyNew(device.cookSessions, backup.cookSessions),
      mealEntries: onlyNew(device.mealEntries, backup.mealEntries),
      dayLogs: onlyNew(device.dayLogs, backup.dayLogs),
      groups: onlyNew(device.groups, backup.groups),
    };
    resulting = {
      profiles: [...device.profiles, ...toWrite.profiles],
      userIngredients: [...device.userIngredients, ...toWrite.userIngredients],
      settings: device.settings,
      batches: [...device.batches, ...toWrite.batches],
      cookSessions: [...device.cookSessions, ...toWrite.cookSessions],
      mealEntries: [...device.mealEntries, ...toWrite.mealEntries],
      dayLogs: [...device.dayLogs, ...toWrite.dayLogs],
      groups: [...device.groups, ...toWrite.groups],
    };
  }

  const errors = checkIntegrity(
    resulting, bundled, mode === 'replace' ? 'the backup' : 'the backup or on this device',
  );
  if (errors.length > 0) return { ok: false, errors };

  const perTable = Object.fromEntries(TABLE_NAMES.map((t) => [t, {
    incoming: backup[t].length,
    added: toWrite[t].length,
    alreadyPresent: mode === 'merge' ? backup[t].length - toWrite[t].length : 0,
    erased: mode === 'replace' ? device[t].length : 0,
  }])) as Record<TableName, TableCounts>;

  return { ok: true, value: { mode, perTable, toWrite } };
}

// ---------------------------------------------------------------------------
// Copy for the preview and the result. Only the tables a person recognises are
// listed; day records and settings are counted but not named.

const SHOWN: readonly (readonly [TableName, string, string])[] = [
  ['batches', 'purchase', 'purchases'],
  ['cookSessions', 'cook', 'cooks'],
  ['mealEntries', 'meal', 'meals'],
  ['profiles', 'profile', 'profiles'],
  ['userIngredients', 'added ingredient', 'added ingredients'],
  ['groups', 'group', 'groups'],
];

/** "2 purchases, 1 cook and 4 meals", or null when every count is zero. */
function listCounts(plan: RestorePlan, pick: (c: TableCounts) => number): string | null {
  const parts = SHOWN.flatMap(([t, one, many]) => {
    const n = pick(plan.perTable[t]);
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

export function planSummary(plan: RestorePlan): string {
  if (plan.mode === 'merge') {
    const added = listCounts(plan, (c) => c.added);
    const kept = SHOWN.reduce((sum, [t]) => sum + plan.perTable[t].alreadyPresent, 0);
    const head = added === null ? 'Nothing in this backup is new to this device.' : `Adds ${added}.`;
    if (kept === 0) return head;
    return `${head} ${kept} ${kept === 1 ? 'item is' : 'items are'} already on this device and will be kept as they are.`;
  }
  const incoming = listCounts(plan, (c) => c.incoming) ?? 'nothing';
  const erased = listCounts(plan, (c) => c.erased);
  return erased === null
    ? `This device has nothing on it yet. The backup's ${incoming} will be restored.`
    : `This erases everything on this device — ${erased} — and replaces it with the backup's ${incoming}.`;
}

export function restoredSummary(plan: RestorePlan): string {
  if (plan.mode === 'merge') {
    const added = listCounts(plan, (c) => c.added);
    return added === null ? 'Merged. Nothing was new.' : `Merged. Added ${added}.`;
  }
  const incoming = listCounts(plan, (c) => c.incoming);
  return incoming === null ? 'Restored. The backup was empty.' : `Restored ${incoming}.`;
}
