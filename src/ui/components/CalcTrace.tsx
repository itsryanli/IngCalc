import type { CalcStep } from '../../core/nutrition';

export function CalcTrace({ steps }: { steps: readonly CalcStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="calc-trace">
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`}>
          <span className="calc-trace__label">{s.label}</span>
          <span className="calc-trace__detail">{s.detail}</span>
          <span className="calc-trace__value">{s.value}</span>
          {s.sourceNote !== undefined && <span className="calc-trace__source">{s.sourceNote}</span>}
        </li>
      ))}
    </ol>
  );
}
