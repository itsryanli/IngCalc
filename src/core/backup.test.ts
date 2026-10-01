import { describe, it, expect } from 'vitest';
import {
  checkIntegrity, CURRENT_SCHEMA_VERSION, emptyTables, isIsoDate, makeBackup, MAX_MESSAGE_LINES,
  NOT_OURS, NOT_READABLE, parseBackup, planRestore, planSummary, restoredSummary, TOO_NEW,
  type BackupTables,
} from './backup';
import { zeroNutrients } from './nutrients';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INGREDIENTS } from '../data/ingredients';
import { g } from './units';

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

describe('parseBackup: shopping trips and backup reminders', () => {
  it('accepts a purchase that belongs to a shopping trip', () => {
    expect(errorsFor('batches', { ...VALID.batches, purchase: { ...purchase, tripId: 't1' } })).toEqual([]);
  });

  it('rejects an empty trip id', () => {
    expect(errorsFor('batches', { ...VALID.batches, purchase: { ...purchase, tripId: '' } })).not.toEqual([]);
  });

  it('accepts settings that record the last backup', () => {
    expect(errorsFor('settings', { ...VALID.settings, lastBackupAt: 1_790_000_000_000 })).toEqual([]);
  });

  it('rejects a last-backup time that is not a number', () => {
    expect(errorsFor('settings', { ...VALID.settings, lastBackupAt: 'yesterday' })).not.toEqual([]);
  });
});

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

describe('parseBackup: bounds reject absurd-but-finite numbers', () => {
  // [table, noun, label, patch]. Each pushes exactly one bounded field just past its limit.
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['profiles', 'profile', 'height', { heightCm: 301 }],
    ['profiles', 'profile', 'weight', { weightKg: 1001 }],
    ['profiles', 'profile', 'sessions per week', { sessionsPerWeek: 101 }],
    ['profiles', 'profile', 'protein target', { proteinGPerKg: 11 }],
    ['userIngredients', 'added ingredient', 'nutrients', { per100gRaw: { ...zeroNutrients(), protein: 100_001 } }],
    ['userIngredients', 'added ingredient', 'published yields', { publishedYield: { steamed: 11 } }],
    ['batches', 'purchase', 'weight', { rawWeightG: 1_000_001 }],
    ['batches', 'purchase', 'price', { purchase: { ...purchase, pricePaidMYR: 1e308 } }],
    ['cookSessions', 'cook', 'raw weight', { rawUsedG: 1_000_001 }],
    ['cookSessions', 'cook', 'cooked weight', { cookedWeightG: 1_000_001 }],
    ['cookSessions', 'cook', 'portion count', { portionCount: 1001 }],
    ['dayLogs', 'day record', 'calorie target', { targets: { ...targets, kcal: 1_000_001 } }],
    ['dayLogs', 'day record', 'protein target', { targets: { ...targets, proteinG: 1_000_001 } }],
    ['dayLogs', 'day record', 'nutrient targets', { targets: { ...targets, micros: { iron: { rni: 1_000_001, dv: 18 } } } }],
  ];
  it.each(cases)('%s: %s has an invalid %s', (table, noun, label, patch) => {
    const row = { ...VALID[table as keyof typeof VALID], ...patch };
    expect(errorsFor(table, row)).toContain(`1 ${noun} has an invalid ${label}.`);
  });

  const entryCases: [keyof typeof ENTRIES, string, Record<string, unknown>][] = [
    ['portion', 'portion count', { portions: 1001 }],
    ['weight', 'weight', { grams: 1_000_001 }],
    ['ingredient', 'weight', { cookedG: 1_000_001 }],
    ['quick', 'calorie figure', { kcal: 100_001 }],
    ['quick', 'protein figure', { proteinG: 10_001 }],
  ];
  it.each(entryCases)('a %s meal entry has an invalid %s', (kind, label, patch) => {
    expect(errorsFor('mealEntries', { ...ENTRIES[kind], ...patch }))
      .toContain(`1 meal entry has an invalid ${label}.`);
  });

  it('accepts the exact upper bound of every bounded field', () => {
    const boundary = {
      profiles: { ...VALID.profiles, heightCm: 300, weightKg: 1000, sessionsPerWeek: 100, proteinGPerKg: 10 },
      userIngredients: {
        ...VALID.userIngredients,
        per100gRaw: { ...zeroNutrients(), protein: 100_000 },
        publishedYield: { steamed: 10 },
      },
      settings: VALID.settings,
      batches: { ...VALID.batches, rawWeightG: 1_000_000, purchase: { ...purchase, pricePaidMYR: 1_000_000 } },
      cookSessions: { ...VALID.cookSessions, rawUsedG: 1_000_000, cookedWeightG: 1_000_000, portionCount: 1000 },
      dayLogs: {
        ...VALID.dayLogs,
        targets: { kcal: 1_000_000, proteinG: 1_000_000, micros: { iron: { rni: 1_000_000, dv: 1_000_000 } } },
      },
    };
    const boundaryEntries = {
      portion: { ...ENTRIES.portion, portions: 1000 },
      weight: { ...ENTRIES.weight, grams: 1_000_000 },
      ingredient: { ...ENTRIES.ingredient, cookedG: 1_000_000 },
      quick: { ...ENTRIES.quick, kcal: 100_000, proteinG: 10_000 },
    };
    const r = parseBackup(envelope({
      ...Object.fromEntries(Object.entries(boundary).map(([t, row]) => [t, [row]])),
      mealEntries: Object.values(boundaryEntries).map((e, i) => ({ ...e, id: `e${i}` })),
    }));
    expect(r.ok).toBe(true);
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

const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');

/** A fresh, mutable copy every call. */
const fixture = (): BackupTables => {
  const r = parseBackup(FIXTURE);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

const replaceErrors = (t: BackupTables) => {
  const r = planRestore('replace', t, emptyTables(), INGREDIENTS);
  return r.ok ? [] : r.errors;
};

describe('the v3 fixture', () => {
  it('restores in both modes onto an empty device, forever', () => {
    expect(planRestore('replace', fixture(), emptyTables(), INGREDIENTS).ok).toBe(true);
    expect(planRestore('merge', fixture(), emptyTables(), INGREDIENTS).ok).toBe(true);
  });
});

describe('checkIntegrity: references', () => {
  it('finds a cook whose purchase is missing', () => {
    const t = fixture();
    t.batches = t.batches.filter((b) => b.id !== 'b-chicken');
    expect(replaceErrors(t)).toContain("1 cook refers to a purchase that isn't in the backup.");
  });

  it('finds meal entries whose cook is missing', () => {
    const t = fixture();
    t.cookSessions = [];
    expect(replaceErrors(t)).toContain("2 meal entries refer to cooks that aren't in the backup.");
  });

  it('finds entries and day records whose profile is missing', () => {
    const t = fixture();
    t.profiles = [];
    const errors = replaceErrors(t);
    expect(errors).toContain("4 meal entries refer to profiles that aren't in the backup.");
    expect(errors).toContain("1 day record refers to a profile that isn't in the backup.");
  });

  it('finds a purchase and an ingredient entry whose ingredient is missing', () => {
    const t = fixture();
    t.userIngredients = [];
    t.mealEntries = t.mealEntries.map((e) => (e.kind === 'ingredient' ? { ...e, ingredientId: 'nope' } : e));
    const errors = replaceErrors(t);
    expect(errors).toContain("1 purchase refers to an ingredient that isn't in the backup.");
    expect(errors).toContain("1 meal entry refers to an ingredient that isn't in the backup.");
  });

  it('resolves built-in ingredients without the backup carrying them', () => {
    expect(checkIntegrity(fixture(), INGREDIENTS, 'the backup')).toEqual([]);
  });
});

describe('checkIntegrity: lifecycle', () => {
  it('finds a purchase with more cooked from it than was bought', () => {
    const t = fixture();
    t.cookSessions = [{ ...t.cookSessions[0]!, rawUsedG: g(1200) }];
    expect(replaceErrors(t)).toContain(
      'The Chicken breast, skinless bought on 2026-09-19 has more cooked from it than was bought.',
    );
  });

  it('finds a cook with more eaten from it than it produced', () => {
    const t = fixture();
    // 71g + 100g already eaten from 284g; another 150g is 37g too many.
    t.mealEntries.push({ ...t.mealEntries[1]!, id: 'e-extra', kind: 'weight', cookSessionId: 's-roast', grams: g(150) } as never);
    expect(replaceErrors(t)).toContain(
      'More was eaten from the Chicken breast, skinless cooked on 2026-09-19 than the cook produced.',
    );
  });

  it('allows a cook eaten to the gram', () => {
    const t = fixture();
    t.mealEntries.push({ ...t.mealEntries[1]!, id: 'e-rest', kind: 'weight', cookSessionId: 's-roast', grams: g(113) } as never);
    expect(replaceErrors(t)).toEqual([]);
  });
});

describe('planRestore: replace', () => {
  it('writes the backup and counts what it erases', () => {
    const device = fixture();
    const r = planRestore('replace', fixture(), device, INGREDIENTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toWrite.batches.map((b) => b.id)).toEqual(['b-chicken', 'b-tempeh']);
    expect(r.value.perTable.mealEntries).toEqual({ incoming: 4, added: 4, alreadyPresent: 0, erased: 4 });
  });

  it('nulls an active profile that the backup does not contain, rather than refusing', () => {
    const t = fixture();
    t.settings = [{ ...t.settings[0]!, activeProfileId: 'gone' }];
    const r = planRestore('replace', t, emptyTables(), INGREDIENTS);
    expect(r.ok && r.value.toWrite.settings[0]!.activeProfileId).toBeNull();
  });
});

describe('planRestore: merge', () => {
  it('adds only rows the device lacks, and the device wins on a shared id', () => {
    const device = emptyTables();
    const mine = fixture();
    device.profiles = mine.profiles;
    device.batches = [{ ...mine.batches[0]!, purchase: { ...mine.batches[0]!.purchase, location: 'Changed here' } }];
    const r = planRestore('merge', fixture(), device, INGREDIENTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.toWrite.batches.map((b) => b.id)).toEqual(['b-tempeh']);
    expect(r.value.toWrite.profiles).toEqual([]);
    expect(r.value.perTable.batches).toEqual({ incoming: 2, added: 1, alreadyPresent: 1, erased: 0 });
  });

  it('never writes settings', () => {
    const r = planRestore('merge', fixture(), emptyTables(), INGREDIENTS);
    expect(r.ok && r.value.toWrite.settings).toEqual([]);
  });

  it('refuses a merge whose rows are each valid but together over-eat a cook', () => {
    // The device ate 200g from the same cook; the backup's own 171g is fine
    // alone. Together, 371g from 284g.
    const device = fixture();
    device.mealEntries = [{
      id: 'e-device', profileId: 'p-ali', date: '2026-09-21', label: 'dinner', createdAt: 9,
      kind: 'weight', cookSessionId: 's-roast', grams: g(200),
    }];
    const r = planRestore('merge', fixture(), device, INGREDIENTS);
    expect(r).toEqual({
      ok: false,
      errors: ['More was eaten from the Chicken breast, skinless cooked on 2026-09-19 than the cook produced.'],
    });
  });

  it('says "or on this device" when a reference is missing from both', () => {
    const t = fixture();
    t.batches = [];
    const r = planRestore('merge', t, emptyTables(), INGREDIENTS);
    expect(r.ok ? [] : r.errors).toContain("1 cook refers to a purchase that isn't in the backup or on this device.");
  });
});

describe('planSummary and restoredSummary', () => {
  const plan = (mode: 'replace' | 'merge', device: BackupTables) => {
    const r = planRestore(mode, fixture(), device, INGREDIENTS);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.value;
  };
  const LIST = '2 purchases, 1 cook, 4 meals, 1 profile and 1 added ingredient';

  it('describes a merge onto an empty device', () => {
    expect(planSummary(plan('merge', emptyTables()))).toBe(`Adds ${LIST}.`);
    expect(restoredSummary(plan('merge', emptyTables()))).toBe(`Merged. Added ${LIST}.`);
  });

  it('describes a merge that adds nothing', () => {
    expect(planSummary(plan('merge', fixture()))).toBe(
      'Nothing in this backup is new to this device. 9 items are already on this device and will be kept as they are.',
    );
    expect(restoredSummary(plan('merge', fixture()))).toBe('Merged. Nothing was new.');
  });

  it('describes a replace over existing data by what it erases', () => {
    expect(planSummary(plan('replace', fixture()))).toBe(
      `This erases everything on this device — ${LIST} — and replaces it with the backup's ${LIST}.`,
    );
    expect(restoredSummary(plan('replace', fixture()))).toBe(`Restored ${LIST}.`);
  });

  it('describes a replace onto an empty device without talking about erasing', () => {
    expect(planSummary(plan('replace', emptyTables()))).toBe(
      `This device has nothing on it yet. The backup's ${LIST} will be restored.`,
    );
  });
});
