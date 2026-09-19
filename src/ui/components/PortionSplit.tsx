import { useId, useState } from 'react';
import { formatG, g, type Grams } from '../../core/units';

interface Props {
  /** Always a whole number of at least one; the parent never holds an invalid count. */
  value: number;
  /**
   * The cooked weight, never the raw one. You portion cooked food into
   * containers, so the split divides what comes out of the pan regardless of
   * which side the user typed into the calculator.
   */
  cookedWeightG: Grams;
  onChange: (portionCount: number) => void;
}

export function PortionSplit({ value, cookedWeightG, onChange }: Props) {
  const id = useId();
  // Held as text so a half-typed count ("2." on the way to "2.5") stays on
  // screen instead of being rewritten under the cursor. Only valid counts are
  // handed up; `value` is therefore always safe to divide by.
  //
  // Deliberately not synced back from `value` by an effect: `value` only ever
  // changes because this input changed it, so an effect could only overwrite
  // what the user is mid-way through typing — it would refill an emptied field
  // with "1" under the cursor.
  const [text, setText] = useState(`${value}`);

  const handle = (raw: string) => {
    setText(raw);

    // An emptied field reads as "no split" rather than as a held-over count —
    // and it is the only branch that must not fall through, since Number('')
    // is 0 and every nutrient would divide to Infinity.
    if (raw.trim() === '') {
      onChange(1);
      return;
    }

    const parsed = Number(raw);
    // Portions are whole containers. Anything else keeps the last valid count
    // rather than rejecting the keystroke, so typing stays uninterrupted.
    if (!Number.isInteger(parsed) || parsed < 1) return;

    onChange(parsed);
  };

  return (
    <div className="field">
      <label htmlFor={id}>Split into</label>
      <div className="weight__row">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={text}
          onChange={(e) => handle(e.target.value)}
        />
        <span className="portion-split__unit">portions</span>
      </div>
      <p className="portion-split__readout" data-testid="portion-weight">
        {formatG(g(cookedWeightG / value))} per portion
      </p>
    </div>
  );
}
