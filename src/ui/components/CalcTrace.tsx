import type { CalcStep } from '../../core/nutrition';

export function CalcTrace({ steps }: { steps: readonly CalcStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="calc-trace">
      {steps.map((s, i) => (
        // A step with no value is prose, not a calculation; the monospace
        // treatment for arithmetic would misrepresent it.
        <li key={`${s.label}-${i}`} className={s.value === '' ? 'calc-trace__prose' : undefined}>
          <span className="calc-trace__label">{s.label}</span>
          <span className="calc-trace__detail">{s.detail}</span>
          <span className="calc-trace__value">{s.value}</span>
          {s.sourceNote !== undefined && <span className="calc-trace__source">{s.sourceNote}</span>}
        </li>
      ))}
    </ol>
  );
}
