# IngCalc Phase 3 — The Log: meals, days, and derived remainders

**Date:** 2026-09-19
**Status:** Approved for planning
**Parent spec:** `docs/superpowers/specs/2026-09-16-ingredient-calculator-design.md`
**Read first:** `docs/superpowers/2026-09-19-phase-2-execution-record.md`

---

## 1. What this document is

An addendum, not a replacement. The parent spec defines Phase 3's place in the
phasing (§8: *"Today screen, meals, quick-add, daily targets, DayLog snapshots
— closes the calorie loop"*), sketches its data model (§3) and its screen (§5).

This records what changed once Phase 2 existed and the app was used: a screen
renamed, a responsibility boundary drawn between three screens, a container
entity dropped, an entry kind added, and `CookSession.cookedRemainingG`
converted from stored to derived — which is the change everything else rests on.

Phase 2 closed the calibration loop: the app's yield figures are now the user's
own. Phase 3 closes the calorie loop. It is also the first phase whose screen
the user is expected to open every day, which is why speed of entry is a design
constraint rather than a nicety.

---

## 2. The responsibility split

The organising decision of this phase, from which most of the rest follows.

| Screen | Owns | Writes |
|---|---|---|
| **Kitchen** | Money → raw grams → cooked portions | `batches`, `cookSessions` |
| **Log** | Cooked portions → a day | `mealEntries`, `dayLogs` |
| **Calc** | What-if comparison | nothing |
| **Profile** | Who the targets are for | `profiles`, `settings` |

Three consequences, each a deliberate departure from what Phase 2 shipped:

**Kitchen stops recording consumption.** `EatControl` is deleted. Kitchen still
*shows* what is left, but that figure is now derived from meal entries (§5)
rather than written by a button on the cook session.

**Calc stops writing anything.** The existing *log this as a batch* action is
removed. Calc's remaining job — method comparison, protein per ringgit, what
200g of something you do not own would come to — is deciding, not recording.

**Log is the only screen that records eating.** There is no hand-off from Calc.

### Why Calc loses its write path

This was raised as redundancy during design and the diagnosis is worth keeping:
the buttons were not the duplication, Calc's double role was.

Calc holds an ingredient picker, a weight input, a raw/cooked toggle, a method
selector and a live nutrient readout. Log's *any ingredient* entry form needs an
ingredient picker, a weight input, a raw/cooked toggle and a method selector.
**Log's entry form is the calculator.** A hand-off button from Calc to Log would
have bridged two instances of the same thing. Giving Log's form its own live
nutrient readout (§6) removes the reason to start in Calc at all when the
intention is to record something.

The cost is a real shortcut: computing a purchase decision in Calc and then
recording the purchase now means re-picking the ingredient in Kitchen. The
purchase form wants raw weight, price, location and date, of which Calc can
supply at most two, so the button was saving two fields out of five on an
infrequent path.

The benefit is that `CalcScreen` goes from three responsibilities to one. The
execution record §1.4 documents a user-reachable dead end caused precisely by
two write-flows competing over one ternary in that screen; removing both
write-flows removes the bug class rather than patching it again.

### The tab is called Log

`Today` was the parent spec's name. It is wrong once past days are reachable.
*Meals* undersells the progress-against-targets half of the screen, and a
quick-added teh tarik is not a meal. Tab bar: **Log · Kitchen · Calc · Profile**.

---

## 3. Departures from the parent spec's interfaces

### 3.1 `Meal` is not a table

The parent spec §3 defines a `Meal` row holding `id`, `profileId`, `date`,
`label` and an array of entries. This phase stores entries as their own table
and drops the container.

A `Meal` row would carry no value of its own: every real quantity lives on the
entries. It would have to be created before a day's first entry of that label
and deleted after the last one, introducing an orphan class — a meal with no
entries — for no gain.

Two further reasons specific to this phase:

- **The derivation in §5 sums every entry against a cook session.** With entries
  nested inside meals, answering that means loading every meal ever written and
  flattening it. With a flat table indexed by `cookSessionId` it is one query.
- **Editing one entry rewrites one small row** rather than a whole day's array.
  The execution record's stale-snapshot race (deferred list, `SessionRow` /
  `EatControl`) is exactly the read-modify-write-the-whole-object pattern that a
  nested array would reproduce, with more writers.

A "meal" becomes a grouping of entries by `(profileId, date, label)`, computed
on read. It remains a word in the UI and stops being an entity.

### 3.2 `CookSession.cookedRemainingG` is derived, not stored

The load-bearing change. Phase 2 stored it and the execution record §3.1
explains why that was right at the time: *"derive what has an event log, store
what does not."* Eating wrote no record, so there was no log to derive from.

Meals are that log. The field is removed from the type and the remainder becomes

```
cookedRemainingG(session, entries) = session.cookedWeightG − Σ grams of entries against it
```

This is the project's own stated rule applied as soon as its precondition holds.
What it buys:

- **Deleting a meal entry restores the remainder for free.** No compensating
  write, so no branch where the compensation is wrong.
- **Editing an entry is arithmetic, not reconciliation.**
- **Drift is impossible.** There is no second number to disagree with the first.
- **The stale-snapshot race disappears** rather than being fixed. The execution
  record proposed field-scoped `update()` helpers plus a transaction for this
  phase, on the grounds that Phase 3 multiplies the writers to that row. There
  are now no writers to that row, because there is no row field.

Removed along with it: `applyEat`, `validateEat`, and
`rescaleCookedRemaining`'s remainder-scaling responsibility. `batchState`'s
`'finished'` test reads the derived figure.

`portionsToGrams` **stays** in `core/batch.ts` and is what `core/meals.ts` calls
to turn a `portion` entry into grams. Reimplementing that conversion in the new
module would put the portions-are-a-view-over-grams rule in two places.

**No migration is required.** The app holds no real data at the time of writing,
confirmed with the user during design. Had it held data, every partially eaten
cook would have carried a remainder below its cooked weight with no entries to
explain the gap, and v3 would have needed synthetic entries or a per-session
offset. This is recorded because the reasoning is the interesting part, and
because anyone reading this later should know the clean schema was bought with
an empty database, not with cleverness.

### 3.3 `MealEntry` gains a fourth kind

The parent spec §3 defines three: `portion`, `weight`, `quick`. The first two
resolve to a cook session and carry all eleven nutrients. The third carries a
calorie figure the user typed.

That leaves no good way to record **food that was eaten but never purchased as a
tracked batch** — eggs, a banana, something someone else cooked. The ingredient
is in the dataset with full nutrients, but with no `Batch` behind it the only
available kind is `quick`, which discards the entire nutrient engine and asks
the user to guess a calorie number.

```ts
| { kind: 'ingredient'; ingredientId: string; method: CookMethod; cookedG: Grams }
```

The justification is not convenience. It is that the micronutrient half of the
app is only honest if most entries carry micronutrients. A day that is largely
quick-adds renders *"48% of your iron"* over food whose iron is unknown — a
figure that looks precise and is not. With a fourth kind, `quick` shrinks back
to what the parent spec intended it for (restaurant food, the thing with no
ingredient list) and stays the exception. §7 covers what the rollup says when it
is not.

### 3.4 `MealLabel` is a closed union

The parent spec types it `'breakfast' | 'lunch' | 'dinner' | 'snack' | string`,
which collapses to `string` in TypeScript and buys nothing. The day groups
entries in a known order, which free text cannot sort. Four labels, closed.

---

## 4. Storage — schema version 3

```ts
export const SCHEMA_V3: Record<string, string> = {
  mealEntries: 'id, [profileId+date], cookSessionId',
  dayLogs: 'id',
};
```

Exported the same way as `SCHEMA_V1` and `SCHEMA_V2`, so `migration.test.ts`
builds its throwaway databases from the real declarations and cannot drift.
Dexie's `stores()` is a delta: v1 and v2 tables stay declared and untouched, no
migration function, no existing row rewritten.

### Types

```ts
export type MealLabel = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface MealEntryBase {
  id: string;
  profileId: string;
  /** Local calendar date via `todayIso`, never `toISOString()`. See execution record §3.9. */
  date: IsoDate;
  label: MealLabel;
  /** Orders entries within a label. */
  createdAt: number;
}

export type MealEntry = MealEntryBase & (
  | { kind: 'portion';    cookSessionId: string; portions: number }
  | { kind: 'weight';     cookSessionId: string; grams: Grams }
  | { kind: 'ingredient'; ingredientId: string; method: CookMethod; cookedG: Grams }
  | { kind: 'quick';      name: string; kcal: number; proteinG?: number }
);

export interface DayLog {
  /** `${profileId}:${date}` — a natural key, so a duplicate row is impossible. */
  id: string;
  profileId: string;
  date: IsoDate;
  targets: {
    kcal: number;
    proteinG: number;
    micros: Partial<Record<NutrientKey, MicroTarget>>;
  };
}
```

`quick.name` rather than `quick.label`: `label` is already the meal slot on the
base, and one field meaning two things in one object is how the wrong one gets
rendered.

### Indexes

`[profileId+date]` serves the day view — the only query the screen makes on
load. `cookSessionId` serves the remainder derivation.

`quick` and `ingredient` entries have no `cookSessionId`. Dexie omits rows whose
indexed key is `undefined`, so they are absent from session queries **by
construction** rather than by a filter someone can forget to write.

`dayLogs` needs no secondary index: its primary key is the lookup.

### Writing a DayLog

Written once, when a profile-day's first entry is created, **in the same
transaction as that entry**:

```ts
await db.transaction('rw', db.mealEntries, db.dayLogs, async () => {
  if ((await db.dayLogs.get(key)) === undefined) await db.dayLogs.add(snapshot);
  await db.mealEntries.add(entry);
});
```

A failure cannot leave an entry with no targets to measure it against, and the
natural key makes a duplicate impossible even under a race. A day with no
entries has no `DayLog` and displays the profile's current targets.

**Backfill snapshots the targets in force when the entry is written**, not the
ones in force on the date being logged. Recording Tuesday's dinner on Wednesday
stores Wednesday's targets. Yesterday's body weight is not recoverable, so this
is the only honest option; the screen does not claim otherwise.

### Module

`src/storage/meals.ts`, following `storage/kitchen.ts`:

```ts
loadDay(profileId, date): Promise<{ entries: MealEntry[]; dayLog: DayLog | null }>
listAllEntries(): Promise<MealEntry[]>       // Kitchen's remainders
addEntry(entry, snapshot): Promise<void>     // the transaction above
updateEntry(entry): Promise<void>
deleteEntry(id): Promise<void>
```

`listAllEntries` is a full scan. At one household's rate — order 1,500 rows a
year — this is cheaper than the bookkeeping to avoid it, and `useKitchen`
already loads both its tables whole. The `cookSessionId` index is there so it
can be narrowed to `anyOf(sessionIds)` if measurement ever justifies it.

`useKitchen` loads meal entries alongside batches and sessions, for the same
reason `loadKitchen` already loads both of its tables together: after §3.2 no
derived quantity in `core/batch.ts` can be computed without them.

Deleting a batch already cascades to its cook sessions. It must now also cascade
to meal entries against those sessions, in the same transaction — an entry
pointing at a deleted session would resolve to no nutrients and sit in a day
contributing nothing while still being listed.

---

## 5. Calculation core

New pure module `src/core/meals.ts`. `purity.test.ts` covers it automatically.

```ts
/** Everything needed to resolve an entry to nutrients, passed in rather than imported. */
interface MealContext {
  sessions: readonly CookSession[];
  batches: readonly Batch[];          // a session reaches its ingredient through its batch
  ingredientById: (id: string) => Ingredient | undefined;
  samples: readonly YieldSample[];    // `ingredient` entries inherit calibration
  categoryYield: CategoryYield;
  retention: RetentionLookup;
}

consumedFromSession(sessionId, entries): Grams
cookedRemainingG(session, entries): Grams          // clamped at 0
portionsRemaining(session, entries): number
entryGrams(entry, session): Grams                  // session-backed kinds only
entryNutrients(entry, ctx: MealContext): NutrientProfile
dayTotals(entries, ctx: MealContext): DayTotals
validateEntry(draft, session, entries, editingId: string | null): Validation

interface DayTotals {
  totals: NutrientProfile;
  /** Entries contributing no micronutrient figures — always `quick` ones. */
  unknownMicroEntries: number;
  /** Quick entries whose `proteinG` was left blank. */
  unknownProteinEntries: number;
}
```

`MealContext` is passed in rather than imported because `core/` may not reach
into `data/` — `purity.test.ts` forbids it, and the same discipline is why
`computeCooked` takes its tables as arguments.

`entryGrams` is defined only for `portion` and `weight` entries.
`consumedFromSession` filters to those two kinds before summing; the other two
carry no `cookSessionId` and cannot consume from a session.

### What a portion is worth

The part most likely to be "fixed" wrongly later, so it is stated as a rule.

A `portion` or `weight` entry **must not go through `computeCooked`**. That
would re-derive the cooked weight from a yield factor when the user has already
weighed the pan. Following execution record §3.8 and the precedent set by
`proteinPerMYRRetained`:

```
retained(session) = computeRaw(ingredient, session.rawUsedG)
                    × retentionFor(category, session.method, nutrient)

eaten(entry)      = retained(session) × (entryGrams / session.cookedWeightG)
```

**Cooking moves water, not nutrients.** The measured `cookedWeightG` sets the
concentration, so it belongs in the denominator — never as a factor applied to
the mass. A cook the user measured badly still attributes the right total
nutrients to the whole pan, which is the honest answer, and the user's own
measurement is respected rather than re-derived from a published figure.

`ingredient` entries are the one case with no measured weight. They use the
calculator's path — `rawFromCooked` then retention — and so inherit yield
calibration from the user's own cooks like everything else.

`quick` entries contribute `kcal`, and `proteinG` when given. The other nine
nutrients are zero and the entry counts toward `unknownMicroEntries`; a quick
entry with `proteinG` left blank also counts toward `unknownProteinEntries`.
Zero is what the arithmetic needs and a lie about the food, which is why the
counts travel with the totals rather than being recoverable only by re-reading
the entries — §7 turns them into what the screen says.

### The `editingId` argument

`validateEntry` takes `editingId` as a **required** parameter, not an optional
one, because a caller that forgets it produces a bug that looks like correct
code: editing an entry from 150g to 160g would compare 160 against a remainder
that already has the original 150 subtracted, and refuse a valid edit. When
editing, the remaining-weight check sums every *other* entry against that
session. `null` means the draft is new.

---

## 6. Screens

### Log

```
Log  ·  ← 19 Sep (Today) →  ·  [jump to date]

  1,840 / 2,310 kcal      ████████░░  80%
  128 / 165 g protein     ███████░░░  78%

  Breakfast                                      + add
    3 eggs, fried                    318 kcal · 21g P   ⋮
  Lunch                                          + add
    Chicken breast, roasted — 1 portion
                                     412 kcal · 68g P   ⋮
  Dinner                                         + add
  Snacks                                         + add
    Teh tarik (quick)                180 kcal · — P     ⋮

  [ Nutrients for the day ]
```

One day at a time, opening on today. Arrows step by one day; a date field jumps
further. A rejected alternative — a scrolling list of every past day collapsed
to a line — was declined as a trends feature done badly. Trends are out of scope
(§9) and deserve the real thing later.

**Past days are fully editable.** Forgetting to log dinner and correcting it the
next morning is the most ordinary thing a food diary handles, and entries are
dated rows, so it costs nothing structurally. Past days render against their
frozen `DayLog` targets; only a day with no `DayLog` yet uses current ones.

Components: `DayNav`, `DayProgress`, `MealGroup`, `EntryRow`, `AddEntryForm`,
and a `useLog(profileId, date)` hook shaped like `useKitchen` and `useProfiles`
— same generation-counter refresh, same `storageError` contract.

`AddEntryForm` has three sources behind a segmented control, reusing
`IngredientPicker`, `WeightInput` and the method selector:

1. **From the kitchen** — cook sessions with something remaining, each showing
   portions and grams left. One tap for a portion, or type a weight.
2. **Any ingredient** — picker, method, weight, raw/cooked toggle, **with the
   computed nutrients shown live before saving**. This readout is what makes the
   removal of Calc's hand-off (§2) a simplification rather than a loss.
3. **Quick add** — name, kcal, optional protein.

The meal label defaults by clock — breakfast before 11:00, lunch before 16:00,
dinner before 21:00, otherwise snack — and is an overridable four-way toggle.
The date comes from the day being viewed, not from the clock, so adding to
yesterday adds to yesterday.

### Kitchen

`EatControl` deleted. `SessionRow` shows remaining weight and portions from the
derived figure. `BatchCard`'s cooked-remaining sum reads the derivation.

### Calc

*Log this as a batch* removed, along with `loggingBatch`, `loggedMessage` and
the `AddBatchForm` branch of its ternary. The add-ingredient flow stays.

### Settings

`landingTab` widens from `'today' | 'calc'` to `'log' | 'kitchen' | 'calc'` and
defaults to `'log'`. The stored value has never matched the rendered tab bar.

---

## 7. Error handling

**An error boundary around `<main>`**, with a reset that returns to Log. This is
item M5 on the execution record's deferred list, promoted there to a
prerequisite for Phase 4's restore. Phase 3 makes it more urgent than Phase 4
does: Log is the landing tab and every figure on it is a derived sum over stored
rows, so one malformed row would take down the screen the app opens on, with no
route to the screen that could delete the bad row.

**Days containing a `quick` entry state a floor, not a total.** The
micronutrient section renders *"at least 48%"* against the `--estimate` token,
with a line naming how many entries had unknown micronutrients. Showing the bare
total would assert something false; hiding the section would discard real
information. The app already has a house style of labelling rough figures rather
than suppressing them — the same token carries category-default yields.

**Calories are never floored.** A `quick` entry requires `kcal`, so every
entry on every day contributes a real calorie figure and the day's total is
exact.

**Protein is floored only when a quick entry omits it.** `quick.proteinG` is
optional, so a day containing one blank protein figure reads *"at least 128g"*
on the same `--estimate` treatment as the micronutrients. A day whose quick
entries all carry protein reports protein exactly. This is why `DayTotals`
counts the two cases separately rather than carrying one "incomplete" flag:
calories, protein and micronutrients degrade independently, and collapsing them
would floor a figure that is actually exact.

**Confirmation prompts follow execution record §3.5.** `EntryRow`'s delete
question is a plain `<p>`; `role="alert"` is reserved for a write that actually
failed and renders unconditionally; both confirm transitions clear the error.

**Every write is wrapped**, surfaces through `role="alert"`, `console.error`s
the real rejection, and **does not invoke its success callback on failure**
(execution record §3.4).

| Case | Behaviour |
|---|---|
| Eating more than remains | Blocked, with remaining weight and portions shown |
| Editing an entry above the remainder | Blocked against the remainder excluding itself |
| Editing a cook's cooked weight below what has already been logged against it | Blocked, naming the grams already eaten |
| Entry against a deleted session | Cannot occur — deletion cascades |
| Day with no entries | No `DayLog`; current targets shown |
| No active profile | Log explains and links to Profile; nothing is written |
| Quick entry with no protein | Protein floored, not zeroed |

---

## 8. Testing

The golden-value suite — 94 USDA-verified cases — is **not touched**. This phase
adds no nutrient arithmetic; it re-weights existing arithmetic. Those cases
passing unchanged is the evidence that no published figure moved.

`migration.test.ts` extends to v3 from the exported `SCHEMA_V3`.
`purity.test.ts` covers `core/meals.ts` with no change.

Invariants pinned explicitly:

- A derived remainder is never negative and never exceeds `cookedWeightG`.
- Deleting an entry restores exactly the grams it consumed.
- An entry may be edited up to the remainder **excluding itself**.
- A `DayLog` is written exactly once per profile-day, in the first entry's
  transaction, and never rewritten.
- **Editing a profile's weight does not change any past day's percentages.**
  The reason `dayLogs` exists; the test that would catch its loss.
- Deleting a batch removes its sessions and the meal entries against them.
- A cook's cooked weight cannot be edited below the grams already logged
  against it. Under a stored remainder this was `rescaleCookedRemaining`'s job;
  under derivation the same case becomes a negative remainder, so the guard
  moves to the edit rather than disappearing with the field.
- A portion entry's nutrients equal the session's retained nutrients scaled by
  grams eaten over cooked weight — never via a yield factor.
- A day mixing a quick entry with a portion entry reports a micronutrient floor,
  and an all-known day does not.

**Run `npm test`, `npm run build` and `npm run lint` after every task.** The
execution record §2 records a type error that survived three tasks and two
reviews because `vitest` does not typecheck and the build was run at two of
seventeen tasks. Two of those three commands catch what the others cannot.

**Node 22.12 or later is required to run the suite at all.** Under 22.7 every
test file fails to load: jsdom's `html-encoding-sniffer` does `require()` on the
ESM-only `@exodus/bytes`, which needs `require(esm)`, unflagged only from 22.12.
The failure looks like catastrophic breakage and is a Node version.

---

## 9. Not in Phase 3

| Deferred | Why |
|---|---|
| Weekly averages, streaks, charts, trends | A day is the unit this phase ships. Trends want real data behind them and a design of their own. |
| Copying a meal from another day | Real convenience, but it needs the day view to exist first to know what is worth copying. |
| Recipes — several ingredients as one entry | Parent spec §1 non-goal. A meal is a container of portions. |
| Costs screen, CSV, JSON backup/restore | Phase 4. |
| Barcode or restaurant database | Parent spec §1 non-goal; `quick` covers it. |
