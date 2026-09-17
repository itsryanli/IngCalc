import { NUTRIENT_KEYS, type NutrientKey, type NutrientProfile } from '../../core/types';
import type { MicroTarget } from '../../core/targets';

const LABELS: Record<NutrientKey, string> = {
  kcal: 'Energy', protein: 'Protein', carbs: 'Carbohydrate', fibre: 'Fibre', fat: 'Fat',
  potassium: 'Potassium', iron: 'Iron', magnesium: 'Magnesium',
  zinc: 'Zinc', calcium: 'Calcium', sodium: 'Sodium',
};

const UNITS: Record<NutrientKey, string> = {
  kcal: 'kcal', protein: 'g', carbs: 'g', fibre: 'g', fat: 'g',
  potassium: 'mg', iron: 'mg', magnesium: 'mg', zinc: 'mg', calcium: 'mg', sodium: 'mg',
};

const fmt = (value: number, unit: string): string =>
  `${value.toLocaleString('en-MY', { maximumFractionDigits: unit === 'mg' ? 0 : 1 })}${unit}`;

const pct = (value: number, target: number | undefined, standard: string): string =>
  target === undefined ? `— ${standard}` : `${Math.round((value / target) * 100)}% ${standard}`;

interface Props {
  totals: NutrientProfile;
  targets: Partial<Record<NutrientKey, MicroTarget>>;
  assumedRetentionFor: readonly NutrientKey[];
}

export function NutrientTable({ totals, targets, assumedRetentionFor }: Props) {
  return (
    <table>
      <thead>
        <tr><th scope="col">Nutrient</th><th scope="col">Amount</th><th scope="col">RNI</th><th scope="col">DV</th></tr>
      </thead>
      <tbody>
        {NUTRIENT_KEYS.map((key) => {
          const target = targets[key];
          return (
            <tr key={key}>
              <th scope="row">
                {LABELS[key]}
                {assumedRetentionFor.includes(key) && (
                  <abbr title="Retention assumed 100% — no sourced figure for this nutrient and method"> *</abbr>
                )}
              </th>
              <td>{fmt(totals[key], UNITS[key])}</td>
              <td>{pct(totals[key], target?.rni, 'RNI')}</td>
              <td>{pct(totals[key], target?.dv, 'DV')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
