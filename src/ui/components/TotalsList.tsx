import type { TotalRow } from '../../core/costs';
import { formatMYR } from '../../core/units';

interface Props {
  title: string;
  /** What the first column groups by: "Location", "Month". */
  keyHeading: string;
  rows: readonly TotalRow[];
  showShare?: boolean;
  testId?: string;
}

export function TotalsList({ title, keyHeading, rows, showShare = false, testId }: Props) {
  return (
    <div className="card" data-testid={testId}>
      <h3 className="card__title">{title}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{keyHeading}</th>
              <th scope="col">Purchases</th>
              <th scope="col">Spent</th>
              {showShare && <th scope="col">Share</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.count}</td>
                <td>{formatMYR(r.spentMYR)}</td>
                {showShare && <td>{Math.round(r.share * 100)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
