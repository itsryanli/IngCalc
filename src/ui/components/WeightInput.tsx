import { useId, useState } from 'react';
import { g, gToKg, kgToG, type Grams } from '../../core/units';

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
  const [error, setError] = useState<string | null>(null);
  const displayed = unit === 'kg' ? gToKg(value) : value;

  const handle = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a number');
      return;
    }
    if (parsed < 0) {
      setError('Weight cannot be negative');
      return;
    }
    setError(null);
    onChange(unit === 'kg' ? kgToG(parsed) : g(parsed));
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
        value={displayed}
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
