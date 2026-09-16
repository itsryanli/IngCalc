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
