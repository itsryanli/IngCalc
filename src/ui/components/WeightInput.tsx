import { useId, useState, useEffect } from 'react';
import { g, gToKg, type Grams } from '../../core/units';

export type WeightUnit = 'g' | 'kg';

interface Props {
  value: Grams;
  unit: WeightUnit;
  label: string;
  onChange: (value: Grams) => void;
  onUnitChange: (unit: WeightUnit) => void;
}

export function WeightInput({ value, unit, label, onChange, onUnitChange }: Props) {
  const id = useId();
  const [rawText, setRawText] = useState<string>(() =>
    unit === 'kg' ? gToKg(value).toString() : value.toString()
  );
  const [error, setError] = useState<string | null>(null);

  // Sync rawText when prop value or unit changes from outside
  useEffect(() => {
    setRawText(unit === 'kg' ? gToKg(value).toString() : value.toString());
    setError(null);
  }, [value, unit]);

  const handle = (raw: string) => {
    setRawText(raw);

    if (raw.trim() === '') {
      setError('Enter a valid weight');
      return;
    }

    const parsed = Number(raw);
    // Compute the actual gram value that will be passed to g()
    const grams = unit === 'kg' ? parsed * 1000 : parsed;

    // Validate the value we're about to construct, not just the parsed input
    if (!Number.isFinite(grams) || grams < 0) {
      setError('Enter a valid weight');
      return;
    }

    setError(null);
    onChange(g(grams));
  };

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={unit === 'kg' ? 0.01 : 1}
        value={rawText}
        onChange={(e) => handle(e.target.value)}
      />
      {(['g', 'kg'] as const).map((u) => (
        <button key={u} type="button" aria-pressed={unit === u} onClick={() => onUnitChange(u)}>
          {u}
        </button>
      ))}
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
