/**
 * CSV written directly, per the parent spec ("no export library"). Knows
 * nothing about the domain: callers round and order, this only serialises.
 */

export type CsvCell = string | number | null;

/**
 * A cell Excel would evaluate as a formula. Ingredient names and locations are
 * free text, and a CSV gets opened on other machines, so "=HYPERLINK(...)"
 * must arrive as text. Applied to strings only: numbers are ours, not typed.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`CSV cell must be finite, got ${value}`);
    return String(value);
  }
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * RFC 4180 with CRLF line endings, plus a UTF-8 byte-order mark: without it
 * Excel reads the file as the system code page and mangles non-ASCII names.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return `﻿${[headers, ...rows].map((row) => `${row.map(cell).join(',')}\r\n`).join('')}`;
}
