import type { NutrientProfile, DayLogTargets } from '../../core/types';

interface Props {
  totals: NutrientProfile;
  targets: DayLogTargets;
  /** False when a quick entry left its protein figure blank. */
  proteinExact: boolean;
}

const n = (value: number): string => Math.round(value).toLocaleString('en-MY');

function Bar({ testId, label, value, target, unit, floored }: {
  testId: string; label: string; value: number; target: number; unit: string; floored: boolean;
}) {
  const hasTarget = target > 0;
  const pct = hasTarget ? (value / target) * 100 : 0;

  return (
    <div className="progress" data-testid={`${testId}-progress`}>
      <p className={`progress__line${floored ? ' progress__line--estimate' : ''}`}>
        {floored && 'at least '}{n(value)}{unit} of {hasTarget ? `${n(target)}${unit}` : '— no target'}
        {' '}{label}
        {hasTarget && <span className="progress__pct"> · {Math.round(pct)}%</span>}
      </p>
      <div className="progress__track" aria-hidden="true">
        {/* The bar is capped at the track; the figure above it is not, because
            600 kcal over is something the user needs to see. */}
        <div
          className="progress__bar"
          data-testid={`${testId}-bar`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function DayProgress({ totals, targets, proteinExact }: Props) {
  return (
    <div className="day-progress">
      <Bar testId="kcal" label="calories" value={totals.kcal} target={targets.kcal}
           unit=" kcal" floored={false} />
      <Bar testId="protein" label="protein" value={totals.protein} target={targets.proteinG}
           unit="g" floored={!proteinExact} />
    </div>
  );
}
