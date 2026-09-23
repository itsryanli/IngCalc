import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SORT, ingredientLookup, inRange, MEAL_CSV_HEADERS, mealCsvRows, nextSort,
  PURCHASE_CSV_HEADERS, purchaseCsvRows, purchaseRows, rangeFileTag, sortRows, summarise,
  totalsByLocation, totalsByMonth, type CostRange, type Sort,
} from '../../core/costs';
import { toCsv } from '../../core/csv';
import type { MealContext } from '../../core/meals';
import type { Ingredient, Profile } from '../../core/types';
import { formatMYR } from '../../core/units';
import { CATEGORY_YIELD } from '../../data/categoryYield';
import { INGREDIENTS } from '../../data/ingredients';
import { RETENTION } from '../../data/retentionTable';
import { listUserIngredients } from '../../storage/userIngredients';
import { DataPanel } from '../components/DataPanel';
import { PurchaseTable } from '../components/PurchaseTable';
import { RangePicker } from '../components/RangePicker';
import { TotalsList } from '../components/TotalsList';
import { todayIso } from '../dates';
import { downloadText } from '../download';
import { entryItemName } from '../labels';
import { useKitchen } from '../useKitchen';

const CSV_MIME = 'text/csv;charset=utf-8';

/**
 * Every user ingredient, archived included, which is what `useCatalogue` is
 * built not to return (spec §3.1). A failed read leaves names unresolved
 * rather than blocking the screen; `useKitchen`'s banner covers a dead store.
 */
function useAllUserIngredients() {
  const [list, setList] = useState<Ingredient[]>([]);
  const generationRef = useRef(0);

  const fetchAll = useCallback(async (gen: number) => {
    try {
      const loaded = await listUserIngredients();
      if (gen !== generationRef.current) return;
      setList(loaded);
    } catch (err) {
      console.error('Loading your ingredients failed', err);
    }
  }, []);

  useEffect(() => {
    const gen = generationRef.current;
    void fetchAll(gen);
    return () => { generationRef.current += 1; };
  }, [fetchAll]);

  const refresh = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchAll(gen);
  }, [fetchAll]);

  return { list, refresh };
}

interface Props {
  profiles: readonly Profile[];
  /** A restore has rewritten storage; the app re-reads what it holds. */
  onDataReplaced: () => void;
  today?: Date;
}

export function CostsScreen({ profiles, onDataReplaced, today = new Date() }: Props) {
  const kitchen = useKitchen();
  const user = useAllUserIngredients();
  const [range, setRange] = useState<CostRange>('thisMonth');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const todayStr = todayIso(today);

  const lookup = useMemo(() => ingredientLookup(INGREDIENTS, user.list), [user.list]);

  const rows = useMemo(
    () => purchaseRows(kitchen.batches, kitchen.sessions, lookup, RETENTION)
      .filter((r) => inRange(r.date, range, todayStr)),
    [kitchen.batches, kitchen.sessions, lookup, range, todayStr],
  );
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const entries = useMemo(
    () => kitchen.entries.filter((e) => inRange(e.date, range, todayStr)),
    [kitchen.entries, range, todayStr],
  );

  const ctx: MealContext = useMemo(() => ({
    sessions: kitchen.sessions,
    batches: kitchen.batches,
    ingredientById: lookup,
    samples: kitchen.samples,
    categoryYield: CATEGORY_YIELD,
    retention: RETENTION,
  }), [kitchen.sessions, kitchen.batches, kitchen.samples, lookup]);

  const tag = rangeFileTag(range, todayStr);

  const exportPurchases = sorted.length === 0 ? null : () => {
    downloadText(`ingcalc-purchases-${tag}.csv`, CSV_MIME, toCsv(PURCHASE_CSV_HEADERS, purchaseCsvRows(sorted)));
  };

  const exportMeals = entries.length === 0 ? null : () => {
    const rowsOut = mealCsvRows(entries, ctx, {
      profileName: (id) => profiles.find((p) => p.id === id)?.name,
      itemName: (e) => entryItemName(e, ctx),
    });
    downloadText(`ingcalc-meals-${tag}.csv`, CSV_MIME, toCsv(MEAL_CSV_HEADERS, rowsOut));
  };

  const onRestored = () => {
    void kitchen.refresh();
    void user.refresh();
    onDataReplaced();
  };

  const summary = summarise(rows);
  const { loading, storageError } = kitchen;

  return (
    <section className="screen">
      <h2>Costs</h2>

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <RangePicker value={range} onChange={setRange} />

      {!loading && storageError === null && kitchen.batches.length === 0 && (
        <p className="screen__hint" data-testid="costs-empty">
          Nothing bought yet — purchases you log in Kitchen appear here.
        </p>
      )}

      {!loading && kitchen.batches.length > 0 && rows.length === 0 && (
        <p className="screen__hint" data-testid="costs-none-in-range">Nothing bought in this period.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="costs__summary" data-testid="costs-summary">
            {formatMYR(summary.spentMYR)} · {summary.count} purchase{summary.count === 1 ? '' : 's'} ·{' '}
            {summary.proteinPerMYR === null ? '—' : summary.proteinPerMYR.toFixed(1)} g protein per RM
          </p>

          <div className="card">
            <h3 className="card__title">Purchases</h3>
            <PurchaseTable rows={sorted} sort={sort} onSort={(key) => setSort(nextSort(sort, key))} />
          </div>

          <TotalsList
            title="By location"
            keyHeading="Location"
            rows={totalsByLocation(rows)}
            showShare
            testId="totals-location"
          />
          <TotalsList title="By month" keyHeading="Month" rows={totalsByMonth(rows)} testId="totals-month" />
        </>
      )}

      <DataPanel
        onExportPurchases={exportPurchases}
        onExportMeals={exportMeals}
        onRestored={onRestored}
        today={today}
      />
    </section>
  );
}
