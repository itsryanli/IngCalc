export type Grams = number & { readonly __brand: 'Grams' };
export type MYR = number & { readonly __brand: 'MYR' };

function checkNonNegative(n: number, label: string): void {
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be finite, got ${n}`);
  if (n < 0) throw new RangeError(`${label} must not be negative, got ${n}`);
}

export function g(n: number): Grams {
  checkNonNegative(n, 'Weight in grams');
  return n as Grams;
}

export function myr(n: number): MYR {
  checkNonNegative(n, 'Price in MYR');
  return n as MYR;
}

export const kgToG = (kg: number): Grams => g(kg * 1000);
export const gToKg = (v: Grams): number => v / 1000;

export const addG = (a: Grams, b: Grams): Grams => g(a + b);
export const subG = (a: Grams, b: Grams): Grams => g(a - b);

/**
 * Weights shown to the user. Whole grams above 10g, where a decimal would be
 * false precision on a kitchen scale; one decimal below it, where dropping it
 * would round a real 2.4g to "2g".
 */
export const formatG = (v: Grams): string =>
  `${v.toLocaleString('en-MY', { maximumFractionDigits: v < 10 ? 1 : 0 })}g`;
