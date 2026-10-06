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

const fmt = (value: number, unit: string): string => {
  // Magnitude-based precision: preserve small values that would otherwise round to zero
  let fractionDigits: number;
  if (unit === 'mg') {
    fractionDigits = value < 1 ? 2 : value < 10 ? 1 : 0;
  } else {
    fractionDigits = 1;
  }
  // The "a nonzero amount never renders as 0" invariant still breaks below half the smallest
  // displayable unit: toLocaleString with only maximumFractionDigits trims trailing zeros past
  // the default minimum of 0, so e.g. (0.004).toLocaleString(...,{maximumFractionDigits:2})
  // returns "0", not "0.00". Below that threshold, say so explicitly instead of rounding away.
  const smallestUnit = 1 / 10 ** fractionDigits;
  if (value > 0 && value < smallestUnit / 2) {
    return `<${smallestUnit}${unit}`;
  }
  return `${value.toLocaleString('en-MY', { maximumFractionDigits: fractionDigits })}${unit}`;
};

const pct = (value: number, target: number | undefined, standard: string): string =>
  target === undefined || target <= 0 ? `— ${standard}` : `${Math.round((value / target) * 100)}% ${standard}`;

interface Props {
  totals: NutrientProfile;
  targets: Partial<Record<NutrientKey, MicroTarget>>;
  assumedRetentionFor: readonly NutrientKey[];
  /**
   * True when this profile falls below RNI Malaysia 2017's minimum published age (19), so
   * every RNI column reads "— RNI" not because the nutrient is unmeasured but because no
   * figure exists for this age at all. Silent blanks with no explanation are the failure
   * mode this prop exists to avoid.
   */
  belowRniAge?: boolean;
  /** Nutrients with no figure at all (one food whose label left them out): shown as "Not known". */
  unknown?: readonly NutrientKey[];
  /** Totals that leave out foods with no figure: shown as "at least". */
  atLeastFor?: readonly NutrientKey[];
}

export function NutrientTable({
  totals, targets, assumedRetentionFor, belowRniAge = false, unknown = [], atLeastFor = [],
}: Props) {
  return (
    <table>
      <thead>
        <tr><th scope="col">Nutrient</th><th scope="col">Amount</th><th scope="col">RNI</th><th scope="col">DV</th></tr>
      </thead>
      <tbody>
        {NUTRIENT_KEYS.map((key) => {
          const target = targets[key];
          if (unknown.includes(key)) {
            return (
              <tr key={key} className="nutrient-table__unknown">
                <th scope="row">{LABELS[key]}</th>
                <td>Not known</td>
                <td>—</td>
                <td>—</td>
              </tr>
            );
          }
          const floor = atLeastFor.includes(key) ? 'at least ' : '';
          return (
            <tr key={key}>
              <th scope="row">
                {LABELS[key]}
                {assumedRetentionFor.includes(key) && (
                  <abbr title="Retention assumed 100% — no sourced figure for this nutrient and method"> *</abbr>
                )}
              </th>
              <td>{floor}{fmt(totals[key], UNITS[key])}</td>
              <td>{floor}{pct(totals[key], target?.rni, 'RNI')}</td>
              <td>{floor}{pct(totals[key], target?.dv, 'DV')}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>
            {/* The asterisk marker relies on <abbr title>, which has no hover on a phone —
                the actual target device for this app — so its meaning is otherwise invisible. */}
            {assumedRetentionFor.length > 0 && (
              <p className="nutrient-table__legend">
                * Retention assumed 100% — no sourced figure for this nutrient and cooking method.
              </p>
            )}
            <p className="nutrient-table__legend">
              Iron RNI shown at 15% dietary bioavailability (RNI Malaysia 2017). A less
              bioavailable diet needs a higher figure than this table shows.
            </p>
            {belowRniAge && (
              <p className="nutrient-table__legend" role="note">
                RNI Malaysia 2017 publishes figures for ages 19 and over, so the RNI column is
                blank for this profile. The DV column (a general, non-age-adjusted reference)
                is still shown above.
              </p>
            )}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
