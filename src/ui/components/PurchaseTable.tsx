import type { PurchaseRow, Sort, SortKey } from '../../core/costs';
import { formatG, formatMYR } from '../../core/units';
import { formatIsoDate } from '../dates';

const DASH = '—';
const ratio = (v: number | null): string => (v === null ? DASH : v.toFixed(1));

interface Column {
  key: SortKey;
  label: string;
  cell: (r: PurchaseRow) => string;
}

/** Order is the spec's (§3.4). The first column is pinned by CSS. */
const COLUMNS: readonly Column[] = [
  { key: 'ingredient', label: 'Ingredient', cell: (r) => r.ingredient },
  { key: 'date', label: 'Date', cell: (r) => formatIsoDate(r.date) },
  { key: 'location', label: 'Location', cell: (r) => (r.location.trim() === '' ? DASH : r.location) },
  { key: 'rawWeightG', label: 'Weight', cell: (r) => formatG(r.rawWeightG) },
  { key: 'priceMYR', label: 'Price', cell: (r) => formatMYR(r.priceMYR) },
  { key: 'myrPerKgRaw', label: 'RM/kg', cell: (r) => (r.myrPerKgRaw === null ? DASH : formatMYR(r.myrPerKgRaw)) },
  { key: 'proteinPerMYRRaw', label: 'g protein/RM raw', cell: (r) => ratio(r.proteinPerMYRRaw) },
  { key: 'proteinPerMYRCooked', label: 'g protein/RM cooked', cell: (r) => ratio(r.proteinPerMYRCooked) },
];

const [FIRST, ...REST] = COLUMNS as [Column, ...Column[]];

interface Props {
  rows: readonly PurchaseRow[];
  sort: Sort;
  onSort: (key: SortKey) => void;
}

/**
 * A real table in its own sideways-scrolling box. The page never scrolls
 * sideways; this box does, under a pinned ingredient column.
 */
export function PurchaseTable({ rows, sort, onSort }: Props) {
  return (
    <div className="table-scroll table-scroll--pinned">
      <table className="purchase-table" data-testid="purchase-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button type="button" className="sort-btn" onClick={() => onSort(c.key)}>
                    {c.label}
                    <span className="sort-btn__arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.batchId}>
              <th scope="row">{FIRST.cell(r)}</th>
              {REST.map((c) => <td key={c.key}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
