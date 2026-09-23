import { COST_RANGES, type CostRange } from '../../core/costs';

// eslint-disable-next-line react/only-export-components
export const RANGE_LABELS: Record<CostRange, string> = {
  thisMonth: 'This month',
  last3Months: 'Last 3 months',
  thisYear: 'This year',
  all: 'All time',
};

/** The weight input's segmented control, as a 2×2 grid on a phone. */
export function RangePicker({ value, onChange }: { value: CostRange; onChange: (r: CostRange) => void }) {
  return (
    <div className="seg range-picker" role="group" aria-label="Period">
      {COST_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          className="seg__btn"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
