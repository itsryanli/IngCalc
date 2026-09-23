import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseTable } from './PurchaseTable';
import { DEFAULT_SORT, nextSort, sortRows, type PurchaseRow, type Sort } from '../../core/costs';
import { g, myr } from '../../core/units';
import { formatIsoDate } from '../dates';

const row = (id: string, over: Partial<PurchaseRow> = {}): PurchaseRow => ({
  batchId: id, date: '2026-09-19', ingredient: `Item ${id}`, location: 'Pasar',
  rawWeightG: g(1000), priceMYR: myr(20), myrPerKgRaw: myr(20), proteinRawG: 225,
  proteinPerMYRRaw: 11.25, cookedG: null, myrPerKgCooked: null, proteinPerMYRCooked: null,
  ...over,
});

const bodyRows = () => within(screen.getByTestId('purchase-table')).getAllByRole('row').slice(1);

function Harness({ rows }: { rows: PurchaseRow[] }) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  return <PurchaseTable rows={sortRows(rows, sort)} sort={sort} onSort={(k) => setSort(nextSort(sort, k))} />;
}

describe('PurchaseTable', () => {
  it('shows every column, with the ingredient as the row header', () => {
    render(<PurchaseTable rows={[row('a', { location: '' })]} sort={DEFAULT_SORT} onSort={() => {}} />);
    const [r] = bodyRows();
    expect(within(r!).getByRole('rowheader')).toHaveTextContent('Item a');
    expect(within(r!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      formatIsoDate('2026-09-19'), '—', '1,000g', 'RM20.00', 'RM20.00', '11.3', '—',
    ]);
  });

  it('marks only the active column with aria-sort', () => {
    render(<PurchaseTable rows={[row('a')]} sort={{ key: 'priceMYR', dir: 'asc' }} onSort={() => {}} />);
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Date/ })).not.toHaveAttribute('aria-sort');
  });

  it('reports the column tapped', async () => {
    const onSort = vi.fn();
    render(<PurchaseTable rows={[row('a')]} sort={DEFAULT_SORT} onSort={onSort} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /g protein\/RM cooked/ }));
    expect(onSort).toHaveBeenCalledWith('proteinPerMYRCooked');
  });

  it('sorts on a tap and reverses on a second tap', async () => {
    const user = userEvent.setup();
    render(<Harness rows={[row('cheap', { priceMYR: myr(2) }), row('dear', { priceMYR: myr(40) })]} />);
    await user.click(screen.getByRole('button', { name: /Price/ }));
    expect(within(bodyRows()[0]!).getByRole('rowheader')).toHaveTextContent('Item dear');
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: /Price/ }));
    expect(within(bodyRows()[0]!).getByRole('rowheader')).toHaveTextContent('Item cheap');
  });
});
