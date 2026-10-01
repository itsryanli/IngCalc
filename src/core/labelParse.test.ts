import { describe, it, expect } from 'vitest';
import { parseLabel } from './labelParse';

// Malaysian labels must show a per-100 g column; most also show per serving.
const MALAYSIAN = `
NUTRITION INFORMATION / MAKLUMAT PEMAKANAN
Serving size / Saiz hidangan: 30 g
Servings per package / Hidangan per pek: 10
Per 100 g   Per serving (30 g)
Energy / Tenaga 1580 kJ (378 kcal) 474 kJ (113 kcal)
Carbohydrate / Karbohidrat 60.1 g 18.0 g
Total sugars / Jumlah gula 2.0 g 0.6 g
Protein 12.5 g 3.8 g
Fat / Lemak 10.0 g 3.0 g
Saturated fat / Lemak tepu 4.0 g 1.2 g
Dietary fibre / Serat dietari 5.0 g 1.5 g
Sodium / Natrium 400 mg 120 mg
`;

// US labels give one per-serving column and % daily values.
const US = `
Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 8mg 45%
Potassium 240mg 6%
`;

// European labels: per 100 g, salt rather than sodium, decimal commas.
const EU = `
Nutrition
Typical values per 100g
Energy 1046kJ / 250kcal
Fat 9,6g
of which saturates 2,1g
Carbohydrate 30g
of which sugars 3g
Fibre 2,5g
Protein 9g
Salt 1,2g
`;

describe('parseLabel', () => {
  it('takes the per-100 g column from a bilingual Malaysian label', () => {
    const r = parseLabel(MALAYSIAN);
    expect(r.basis).toBe('per100g');
    expect(r.values).toEqual({ kcal: 378, carbs: 60.1, protein: 12.5, fat: 10, fibre: 5, sodium: 400 });
    expect(r.notes).toEqual([]);
  });

  it('does not let sub-rows (sugars, saturated fat) stand in for their parent', () => {
    const r = parseLabel('Per 100 g\nTotal sugars 2.0 g\nSaturated fat 4.0 g\nCarbohydrate 60 g\nFat 10 g');
    expect(r.values.carbs).toBe(60);
    expect(r.values.fat).toBe(10);
  });

  it('uses the per-100 g column when it comes second', () => {
    const r = parseLabel('Per serving (30 g)   Per 100 g\nProtein 3.8 g 12.5 g');
    expect(r.values.protein).toBe(12.5);
  });

  it('scales a per-serving US label to per 100 g and ignores % daily values', () => {
    const r = parseLabel(US);
    expect(r.basis).toBe('perServing');
    expect(r.servingGrams).toBe(55);
    // 230 kcal per 55 g, and so on
    expect(r.values).toEqual({
      kcal: 418, fat: 14.55, sodium: 290.91, carbs: 67.27, fibre: 7.27, protein: 5.45,
      calcium: 472.73, iron: 14.55, potassium: 436.36,
    });
  });

  it('reads decimal commas and works sodium out from salt', () => {
    const r = parseLabel(EU);
    expect(r.basis).toBe('per100g');
    expect(r.values).toEqual({ kcal: 250, fat: 9.6, carbs: 30, fibre: 2.5, protein: 9, sodium: 480 });
    expect(r.notes).toContain('Sodium was worked out from salt (salt ÷ 2.5).');
  });

  it('prefers sodium over salt when the label gives both', () => {
    const r = parseLabel('Per 100 g\nSalt 1 g\nSodium 380 mg');
    expect(r.values.sodium).toBe(380);
  });

  it('converts energy given only in kJ', () => {
    expect(parseLabel('Per 100 g\nEnergy 1046 kJ').values.kcal).toBe(250);
    expect(parseLabel('Per 100 g\nEnergy (kJ) 1046').values.kcal).toBe(250);
  });

  it('takes units from the row name when the values have none', () => {
    const r = parseLabel('Per 100 g\nProtein (g) 12.5\nSodium (mg) 400\nIron (mcg) 2500');
    expect(r.values).toEqual({ protein: 12.5, sodium: 400, iron: 2.5 });
  });

  it('converts sodium given in grams to milligrams', () => {
    expect(parseLabel('Per 100 g\nSodium 0.4 g').values.sodium).toBe(400);
  });

  it('reads a row whose numbers were pasted on the next line', () => {
    const r = parseLabel('Per 100 g\nProtein\n12.5 g\nFat\n10 g');
    expect(r.values).toEqual({ protein: 12.5, fat: 10 });
  });

  it('fixes a letter O misread as a zero', () => {
    expect(parseLabel('Per 100 g\nTrans fat Og\nFat O.5 g').values.fat).toBe(0.5);
  });

  it('uses the upper limit of a "less than" value and says so', () => {
    const r = parseLabel('Per 100 g\nFat <0.5 g');
    expect(r.values.fat).toBe(0.5);
    expect(r.notes.join(' ')).toMatch(/less than/);
  });

  it('treats per 100 ml as per 100 g, with a note', () => {
    const r = parseLabel('Per 100 ml\nProtein 3.2 g');
    expect(r.basis).toBe('per100ml');
    expect(r.values.protein).toBe(3.2);
    expect(r.notes.join(' ')).toMatch(/100 ml/);
  });

  it('does not convert per-serving values when the serving has no weight', () => {
    const r = parseLabel('Serving size 1 piece\nAmount per serving\nProtein 3 g');
    expect(r.values.protein).toBe(3);
    expect(r.servingGrams).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/no serving size in grams/);
  });

  it('assumes per 100 g when there is no heading, and says so', () => {
    const r = parseLabel('Protein 12 g');
    expect(r.basis).toBe('assumedPer100g');
    expect(r.values.protein).toBe(12);
    expect(r.notes.join(' ')).toMatch(/no "per 100 g" or "per serving" heading/i);
  });

  it('warns when a two-column row has only one value', () => {
    const r = parseLabel('Per 100 g   Per serving (30 g)\nFibre 5 g');
    expect(r.notes.join(' ')).toMatch(/only one value was found for fibre/i);
  });

  it('warns when the energy does not match the macros, a sign of a misread column', () => {
    const r = parseLabel('Per 100 g\nEnergy 113 kcal\nProtein 12.5 g\nCarbohydrate 60 g\nFat 10 g');
    expect(r.notes.join(' ')).toMatch(/doesn't match/);
  });

  it('warns when the macros add up to more than 100 g', () => {
    const r = parseLabel('Per 100 g\nProtein 60 g\nCarbohydrate 60 g');
    expect(r.notes.join(' ')).toMatch(/more than 100 g/);
  });

  it('ignores the ingredients list', () => {
    const r = parseLabel('Ingredients: wheat flour, salt 2 g, palm oil\nPer 100 g\nProtein 9 g');
    expect(r.values).toEqual({ protein: 9 });
  });

  it('returns nothing for text that is not a label', () => {
    expect(parseLabel('hello world').values).toEqual({});
    expect(parseLabel('').values).toEqual({});
  });
});
