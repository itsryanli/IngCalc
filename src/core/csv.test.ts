import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

const BOM = '﻿';

describe('toCsv', () => {
  it('starts with a BOM, separates rows with CRLF and ends with one', () => {
    expect(toCsv(['a', 'b'], [['x', 1]])).toBe(`${BOM}a,b\r\nx,1\r\n`);
  });

  it('writes null as an empty cell', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, 'y', null]])).toBe(`${BOM}a,b,c\r\n,y,\r\n`);
  });

  it.each([
    ['a comma', 'Tesco, Setapak', '"Tesco, Setapak"'],
    ['a quote', 'The "good" pasar', '"The ""good"" pasar"'],
    ['a line feed', 'two\nlines', '"two\nlines"'],
    ['a carriage return', 'two\rlines', '"two\rlines"'],
    ['everything at once', 'a,"b"\r\nc', '"a,""b""\r\nc"'],
  ])('quotes a field containing %s', (_, input, expected) => {
    expect(toCsv(['h'], [[input]])).toBe(`${BOM}h\r\n${expected}\r\n`);
  });

  it.each(['=', '+', '-', '@', '\t'])('neutralises a string starting with %j', (prefix) => {
    expect(toCsv(['h'], [[`${prefix}SUM(A1)`]])).toBe(`${BOM}h\r\n'${prefix}SUM(A1)\r\n`);
  });

  it('neutralises a leading carriage return and still quotes it', () => {
    expect(toCsv(['h'], [['\rx']])).toBe(`${BOM}h\r\n"'\rx"\r\n`);
  });

  it('guards before quoting, so a quoted formula is still neutralised', () => {
    expect(toCsv(['h'], [['=1,2']])).toBe(`${BOM}h\r\n"'=1,2"\r\n`);
  });

  it('leaves numbers alone, negative ones included', () => {
    expect(toCsv(['h'], [[-3.5]])).toBe(`${BOM}h\r\n-3.5\r\n`);
  });

  it('refuses a non-finite number rather than writing NaN into a spreadsheet', () => {
    expect(() => toCsv(['h'], [[Number.NaN]])).toThrow(RangeError);
  });

  it('writes headers only when there are no rows', () => {
    expect(toCsv(['a'], [])).toBe(`${BOM}a\r\n`);
  });
});
