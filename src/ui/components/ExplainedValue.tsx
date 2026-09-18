import { useId, useState } from 'react';
import type { CalcStep } from '../../core/types';
import { CalcTrace } from './CalcTrace';

interface Props {
  label: string;
  value: string;
  steps: readonly CalcStep[];
  /** Forwarded to the value element so existing tests keep their handle on it. */
  testId?: string;
}

/**
 * A figure with its working available on demand.
 *
 * Tap or click toggles, and that state is authoritative. Pointer devices also
 * reveal it on hover via CSS, but hover is never the only way in — this is a
 * phone-first app, and a hover-only explanation is an invisible one on the
 * device it is actually used on.
 */
export function ExplainedValue({ label, value, steps, testId }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`explained${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="explained__row"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="explained__label">{label}</span>
        <span className="explained__value" data-testid={testId}>{value}</span>
        <span className="explained__hint" aria-hidden="true">?</span>
        <span className="visually-hidden">
          {open ? 'Hide' : 'Show'} how {label} is worked out
        </span>
      </button>

      <div className="explained__panel" id={panelId} hidden={!open}>
        <CalcTrace steps={steps} />
      </div>
    </div>
  );
}
