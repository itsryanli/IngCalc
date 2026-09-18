import type { MethodRow } from '../../core/methodCompare';
import type { NutrientKey } from '../../core/types';
import { METHOD_LABELS } from '../labels';

const SOURCE_NOTE: Record<MethodRow['yieldSource'], string> = {
  measured: 'your cooks',
  published: 'published',
  categoryDefault: 'rough estimate',
};

export function MethodCompare({ rows, highlight }: { rows: readonly MethodRow[]; highlight: readonly NutrientKey[] }) {
  return (
    <table aria-label="Method comparison" className="method-compare">
      <thead>
        <tr>
          <th scope="col">Method</th>
          <th scope="col">Weight kept</th>
          {highlight.map((k) => <th key={k} scope="col">{k}</th>)}
          <th scope="col">Yield source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.method}>
            <th scope="row">{METHOD_LABELS[r.method]}</th>
            <td>{Math.round(r.weightKeptPct)}%</td>
            {highlight.map((k) => (
              <td key={k}>
                {Math.round(r.retainedPct[k] ?? 100)}%
                {r.assumedRetentionFor.includes(k) && (
                  <abbr title="Retention assumed 100% — no sourced figure for this nutrient and method"> *</abbr>
                )}
              </td>
            ))}
            <td>{SOURCE_NOTE[r.yieldSource]}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2 + highlight.length + 1}>
            {/* Same reasoning as NutrientTable's legend: <abbr title> has no hover on a phone. */}
            <p className="method-compare__legend">
              * Retention assumed 100% — no sourced figure for this nutrient and cooking method.
            </p>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
