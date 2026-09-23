import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION, emptyTables, isIsoDate, makeBackup, MAX_MESSAGE_LINES,
  NOT_OURS, NOT_READABLE, parseBackup, TOO_NEW,
} from './backup';
import { zeroNutrients } from './nutrients';

const envelope = (tables: Record<string, unknown>, over: Record<string, unknown> = {}): string =>
  JSON.stringify({ app: 'ingcalc', schemaVersion: 3, exportedAt: '2026-09-23T00:00:00.000Z', tables, ...over });

const purchase = { pricePaidMYR: 20, location: 'Pasar', date: '2026-09-19' };
const targets = { kcal: 2400, proteinG: 130, micros: { iron: { rni: 14, dv: 18 } } };
const entryBase = { id: 'e1', profileId: 'p1', date: '2026-09-19', label: 'lunch', createdAt: 1 };

const VALID = {
  profiles: { id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' },
  userIngredients: {
    id: 'u1', name: 'Tempeh', category: 'legume', per100gRaw: { ...zeroNutrients(), protein: 20 },
    publishedYield: { steamed: 1 }, absorbsWater: false, source: 'user', archived: true,
  },
  settings: { id: 'singleton', activeProfileId: 'p1', landingTab: 'log', defaultWeightUnit: 'g' },
  batches: { id: 'b1', ingredientId: 'chicken-breast', rawWeightG: 1000, purchase, createdAt: 1 },
  cookSessions: {
    id: 's1', batchId: 'b1', method: 'roasted', rawUsedG: 400, cookedWeightG: 284,
    cookedAt: '2026-09-19', portionCount: 4, excludeFromCalibration: false,
  },
  dayLogs: { id: 'p1:2026-09-19', profileId: 'p1', date: '2026-09-19', targets },
} as const;

const ENTRIES = {
  portion: { ...entryBase, kind: 'portion', cookSessionId: 's1', portions: 1 },
  weight: { ...entryBase, kind: 'weight', cookSessionId: 's1', grams: 100 },
  ingredient: { ...entryBase, kind: 'ingredient', ingredientId: 'kangkung', method: 'boiled', cookedG: 150 },
  quick: { ...entryBase, kind: 'quick', name: 'Teh tarik', kcal: 120 },
} as const;

const errorsFor = (table: string, row: unknown): string[] => {
  const r = parseBackup(envelope({ [table]: [row] }));
  return r.ok ? [] : r.errors;
};

describe('parseBackup: envelope', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, errors: [NOT_READABLE] });
  });

  it.each([
    ['another app', { app: 'other' }],
    ['a missing version', { schemaVersion: undefined }],
    ['a fractional version', { schemaVersion: 2.5 }],
    ['a zero version', { schemaVersion: 0 }],
    ['missing tables', { tables: undefined }],
    ['tables as a list', { tables: [] }],
  ])('rejects %s', (_, over) => {
    expect(parseBackup(envelope({}, over))).toEqual({ ok: false, errors: [NOT_OURS] });
  });

  it('rejects a file from a newer schema', () => {
    expect(parseBackup(envelope({}, { schemaVersion: CURRENT_SCHEMA_VERSION + 1 })))
      .toEqual({ ok: false, errors: [TOO_NEW] });
  });

  it('accepts an older schema and treats its missing tables as empty', () => {
    const r = parseBackup(envelope({ profiles: [VALID.profiles] }, { schemaVersion: 1 }));
    expect(r).toEqual({ ok: true, value: { ...emptyTables(), profiles: [VALID.profiles] } });
  });

  it('ignores tables it does not know', () => {
    expect(parseBackup(envelope({ recipes: [{ id: 'x' }] })).ok).toBe(true);
  });

  it('rejects a table that is not a list', () => {
    expect(parseBackup(envelope({ batches: { id: 'b1' } })))
      .toEqual({ ok: false, errors: ["The backup's purchases are not a list."] });
  });

  it('accepts one valid row of every table and every entry kind', () => {
    const r = parseBackup(envelope({
      ...Object.fromEntries(Object.entries(VALID).map(([t, row]) => [t, [row]])),
      mealEntries: Object.values(ENTRIES).map((e, i) => ({ ...e, id: `e${i}` })),
    }));
    expect(r.ok).toBe(true);
  });
});

describe('parseBackup: each guard rejects each field it checks', () => {
  // [table, noun, label, patch]. Each breaks exactly one field of a valid row.
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['profiles', 'profile', 'id', { id: '' }],
    ['profiles', 'profile', 'name', { name: '   ' }],
    ['profiles', 'profile', 'sex', { sex: 'other' }],
    ['profiles', 'profile', 'birth year', { birthYear: 1995.5 }],
    ['profiles', 'profile', 'height', { heightCm: 0 }],
    ['profiles', 'profile', 'weight', { weightKg: -1 }],
    ['profiles', 'profile', 'sessions per week', { sessionsPerWeek: -1 }],
    ['profiles', 'profile', 'goal', { goal: 'shred' }],
    ['profiles', 'profile', 'protein target', { proteinGPerKg: 0 }],
    ['userIngredients', 'added ingredient', 'id', { id: 3 }],
    ['userIngredients', 'added ingredient', 'name', { name: '' }],
    ['userIngredients', 'added ingredient', 'category', { category: 'candy' }],
    ['userIngredients', 'added ingredient', 'nutrients', { per100gRaw: { protein: 20 } }],
    ['userIngredients', 'added ingredient', 'published yields', { publishedYield: { microwaved: 0.9 } }],
    ['userIngredients', 'added ingredient', 'published yields', { publishedYield: { steamed: 0 } }],
    ['userIngredients', 'added ingredient', 'water absorption', { absorbsWater: 'no' }],
    ['userIngredients', 'added ingredient', 'source', { source: 'usda' }],
    ['userIngredients', 'added ingredient', 'source reference', { sourceRef: 5 }],
    ['userIngredients', 'added ingredient', 'archived flag', { archived: 1 }],
    ['settings', 'settings row', 'id', { id: 'other' }],
    ['settings', 'settings row', 'active profile', { activeProfileId: '' }],
    ['settings', 'settings row', 'landing tab', { landingTab: 'costs' }],
    ['settings', 'settings row', 'weight unit', { defaultWeightUnit: 'lb' }],
    ['batches', 'purchase', 'id', { id: '' }],
    ['batches', 'purchase', 'ingredient', { ingredientId: '' }],
    ['batches', 'purchase', 'weight', { rawWeightG: 0 }],
    ['batches', 'purchase', 'price', { purchase: { ...purchase, pricePaidMYR: -1 } }],
    ['batches', 'purchase', 'location', { purchase: { ...purchase, location: null } }],
    ['batches', 'purchase', 'date', { purchase: { ...purchase, date: '2026-02-30' } }],
    ['batches', 'purchase', 'creation time', { createdAt: 'x' }],
    ['cookSessions', 'cook', 'purchase', { batchId: '' }],
    ['cookSessions', 'cook', 'cooking method', { method: 'microwaved' }],
    ['cookSessions', 'cook', 'raw weight', { rawUsedG: 0 }],
    ['cookSessions', 'cook', 'cooked weight', { cookedWeightG: -5 }],
    ['cookSessions', 'cook', 'date', { cookedAt: '19/09/2026' }],
    ['cookSessions', 'cook', 'portion count', { portionCount: 1.5 }],
    ['cookSessions', 'cook', 'calibration flag', { excludeFromCalibration: 'yes' }],
    ['dayLogs', 'day record', 'profile-and-date id', { id: 'p1:2026-09-20' }],
    ['dayLogs', 'day record', 'date', { date: '2026-09-31', id: 'p1:2026-09-31' }],
    ['dayLogs', 'day record', 'calorie target', { targets: { ...targets, kcal: -1 } }],
    ['dayLogs', 'day record', 'protein target', { targets: { ...targets, proteinG: 'x' } }],
    ['dayLogs', 'day record', 'nutrient targets', { targets: { ...targets, micros: { iron: { rni: 'x' } } } }],
  ];
  it.each(cases)('%s: %s has an invalid %s', (table, noun, label, patch) => {
    const row = { ...VALID[table as keyof typeof VALID], ...patch };
    expect(errorsFor(table, row)).toContain(`1 ${noun} has an invalid ${label}.`);
  });

  const entryCases: [keyof typeof ENTRIES, string, Record<string, unknown>][] = [
    ['quick', 'id', { id: '' }],
    ['quick', 'profile', { profileId: '' }],
    ['quick', 'date', { date: '2026-13-01' }],
    ['quick', 'meal', { label: 'brunch' }],
    ['quick', 'creation time', { createdAt: null }],
    ['quick', 'kind', { kind: 'drink' }],
    ['portion', 'cook', { cookSessionId: '' }],
    ['portion', 'portion count', { portions: 0 }],
    ['weight', 'cook', { cookSessionId: 7 }],
    ['weight', 'weight', { grams: 0 }],
    ['ingredient', 'ingredient', { ingredientId: '' }],
    ['ingredient', 'cooking method', { method: 'raw' }],
    ['ingredient', 'weight', { cookedG: -1 }],
    ['quick', 'name', { name: ' ' }],
    ['quick', 'calorie figure', { kcal: 0 }],
    ['quick', 'protein figure', { proteinG: -1 }],
  ];
  it.each(entryCases)('a %s meal entry has an invalid %s', (kind, label, patch) => {
    expect(errorsFor('mealEntries', { ...ENTRIES[kind], ...patch }))
      .toContain(`1 meal entry has an invalid ${label}.`);
  });

  it('rejects a row that is not an object', () => {
    expect(errorsFor('profiles', 'Ali')).toEqual(['1 profile has an invalid format.']);
  });
});

describe('parseBackup: whole-table checks and reporting', () => {
  it('rejects duplicate ids within a table', () => {
    const r = parseBackup(envelope({ profiles: [VALID.profiles, VALID.profiles] }));
    expect(r).toEqual({ ok: false, errors: ['1 profile has the same id as another.'] });
  });

  it('rejects more than one settings row', () => {
    const r = parseBackup(envelope({ settings: [VALID.settings, { ...VALID.settings, id: 'x' }] }));
    expect(r.ok ? [] : r.errors).toContain('The backup has more than one settings row.');
  });

  it('counts rows with the same problem into one plural line', () => {
    const bad = [1, 2, 3].map((i) => ({ ...ENTRIES.quick, id: `e${i}`, date: 'soon' }));
    expect(parseBackup(envelope({ mealEntries: bad })))
      .toEqual({ ok: false, errors: ['3 meal entries have an invalid date.'] });
  });

  it('caps the report and says how much it left out', () => {
    const r = parseBackup(envelope({
      profiles: [{ ...VALID.profiles, name: '', sex: 'x', goal: 'x', heightCm: 0, weightKg: 0, birthYear: 'x', sessionsPerWeek: -1 }],
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(MAX_MESSAGE_LINES);
    expect(r.errors.at(-1)).toBe('…and 3 more problems.');
  });
});

describe('isIsoDate', () => {
  it.each([
    ['2026-09-23', true], ['2024-02-29', true], ['2000-02-29', true],
    ['2026-02-29', false], ['1900-02-29', false], ['2026-04-31', false],
    ['2026-00-10', false], ['2026-9-3', false], ['2026-09-23T00:00', false], [20260923, false],
  ])('%s is %s', (v, expected) => {
    expect(isIsoDate(v)).toBe(expected);
  });
});

describe('makeBackup', () => {
  it('stamps the app, the current schema and the instant', () => {
    const f = makeBackup(emptyTables(), new Date('2026-09-23T01:02:03.000Z'));
    expect(f).toEqual({
      app: 'ingcalc', schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: '2026-09-23T01:02:03.000Z', tables: emptyTables(),
    });
  });
});
