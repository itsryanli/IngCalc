// Builds src/data/usdaFoods.ts from USDA FoodData Central's SR Legacy CSV
// download, so every bundled figure comes straight from the published data,
// never from memory or hand transcription. Rerun it to rebuild the file:
//
//   node scripts/build-usda-foods.mjs <path to FoodData_Central_sr_legacy_food_csv_2018-04> [--stats]
//
// Only raw or as-sold foods are taken: the app stores nutrients per 100 g as
// bought and applies cooking itself, so a "cooked" entry would be counted twice.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const statsOnly = process.argv.includes('--stats');
if (dir === undefined) {
  console.error('usage: node scripts/build-usda-foods.mjs <SR Legacy CSV folder> [--stats]');
  process.exit(1);
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const read = (name) => parseCsv(readFileSync(join(dir, name), 'utf8'));

// FoodData Central nutrient ids for the app's nutrients, all per 100 g.
const NUTRIENTS = {
  kcal: '1008', protein: '1003', carbs: '1005', fibre: '1079', fat: '1004',
  potassium: '1092', iron: '1089', magnesium: '1090', zinc: '1095', calcium: '1087', sodium: '1093',
};

const has = (name, ...words) => words.some((w) => name.includes(w));
const COOKED = [' cooked', 'boiled', 'roasted', 'fried', 'baked', 'braised', 'broiled', 'grilled', 'stewed', 'steamed',
  'microwaved', 'simmered', 'scrambled', 'poached', 'pan-browned', 'heated', 'smoked', 'cured', 'canned', 'frozen', 'dehydrated',
  'prepared', 'breaded', 'battered', 'drained', 'with salt'];
// "Prepared with calcium sulfate" (tofu) and "commercially prepared" describe how a food is made, not cooking it.
const notCooked = (n) => !has(n.replace(/(commercially )?prepared with|commercially prepared/g, ''), ...COOKED);

/**
 * Which foods to take, and as what. Each rule: an FDC food category, a test on
 * the lower-cased description, the app category, and whether it is usually
 * eaten as it comes (so forms start on "Not cooked").
 */
const RULES = [
  { cat: 'Vegetables and Vegetable Products', take: (n) => has(n, ', raw') && notCooked(n), as: 'vegetable' },
  { cat: 'Fruits and Fruit Juices', take: (n) => has(n, ', raw') && notCooked(n) && !has(n, 'juice'), as: 'fruit', asIs: true },
  { cat: 'Poultry Products', take: (n) => has(n, ', raw') && notCooked(n), as: 'meat' },
  { cat: 'Pork Products', take: (n) => has(n, ', raw') && notCooked(n), as: 'meat' },
  // Beef and lamb come in hundreds of grade-by-trim variants; the "all grades" and ground forms cover them.
  { cat: 'Beef Products', take: (n) => has(n, ', raw') && notCooked(n) && (has(n, 'all grades') || has(n, 'ground')), as: 'meat' },
  { cat: 'Lamb, Veal, and Game Products', take: (n) => has(n, ', raw') && notCooked(n) && !has(n, 'new zealand'), as: 'meat' },
  { cat: 'Finfish and Shellfish Products', take: (n) => has(n, ', raw') && notCooked(n), as: 'seafood' },
  { cat: 'Legumes and Legume Products', take: (n) => (has(n, ', raw') || has(n, 'tofu') || has(n, 'tempeh')) && notCooked(n), as: 'legume' },
  { cat: 'Nut and Seed Products', take: (n) => (has(n, 'raw') || has(n, 'dried')) && notCooked(n) && !has(n, 'oil'), as: 'nut', asIs: true },
  { cat: 'Cereal Grains and Pasta', take: (n) => (has(n, 'raw') || has(n, 'dry') || has(n, 'flour') || has(n, 'uncooked')) && notCooked(n), as: 'grain' },
  // Plain dairy and eggs only: the group also holds drink powders, desserts and coffee whiteners.
  { cat: 'Dairy and Egg Products', take: (n) => notCooked(n) && /^(milk|cheese|yogurt|cream|butter|ghee|egg|whey|buttermilk|kefir)\b/.test(n) && !has(n, 'substitute', 'imitation', 'ice cream', 'eggnog'), as: (n) => (n.startsWith('egg') ? 'egg' : 'dairy') },
  { cat: 'Fats and Oils', take: (n) => n.startsWith('oil, ') || n.startsWith('butter') || n.startsWith('lard') || has(n, 'ghee'), as: 'other', asIs: true },
  // Extracts are mostly alcohol, which the app does not count, so their calories would not add up.
  { cat: 'Spices and Herbs', take: (n) => !has(n, 'extract'), as: 'other', asIs: true },
  { cat: 'Baked Products', take: (n) => n.startsWith('bread,') && !has(n, 'toasted', 'crumbs', 'stuffing', 'mix'), as: 'grain', asIs: true },
  { cat: 'Sweets', take: (n) => n.startsWith('sugars,') || n.startsWith('honey') || n.startsWith('syrups,'), as: 'other', asIs: true },
  { cat: 'Beverages', take: (n) => (n.startsWith('beverages, coffee') || n.startsWith('beverages, tea')) && has(n, 'brewed'), as: 'other', asIs: true },
];

/** Branded products (a run of capitals such as MORI-NU) and industrial ingredients are not what people buy. */
const branded = (description) => /\b[A-Z][A-Z-]{2,}\b/.test(description.replace(/USDA'?s?/g, ''));

/** USDA's own bookkeeping notes are not part of the food's name. */
const tidy = (description) => description
  .replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s+,/g, ',')
  .trim();

const categories = new Map(read('food_category.csv').map((r) => [r.id, r.description]));
const foods = read('food.csv');
const wanted = new Map(); // fdc_id -> food
for (const f of foods) {
  const cat = categories.get(f.food_category_id);
  const name = f.description.toLowerCase();
  if (branded(f.description) || has(name, 'industrial')) continue;
  const rule = RULES.find((r) => r.cat === cat && r.take(name));
  if (rule !== undefined) wanted.set(f.fdc_id, { f, rule });
}

const ids = new Set(Object.values(NUTRIENTS));
const values = new Map(); // fdc_id -> { nutrientId: amount }
for (const r of read('food_nutrient.csv')) {
  if (!wanted.has(r.fdc_id) || !ids.has(r.nutrient_id)) continue;
  const amount = Number(r.amount);
  if (!Number.isFinite(amount) || amount < 0) continue;
  (values.get(r.fdc_id) ?? values.set(r.fdc_id, {}).get(r.fdc_id))[r.nutrient_id] = amount;
}

const round = (n) => Math.round(n * 100) / 100;
const out = [];
for (const [id, { f, rule }] of wanted) {
  const v = values.get(id) ?? {};
  // A food with no energy or protein figure is not worth offering.
  if (v[NUTRIENTS.kcal] === undefined || v[NUTRIENTS.protein] === undefined) continue;
  const name = f.description.toLowerCase();
  const per = {}, unknown = [];
  for (const [key, nid] of Object.entries(NUTRIENTS)) {
    if (v[nid] === undefined) unknown.push(key);
    else per[key] = round(v[nid]);
  }
  out.push({
    id: `fdc-${id}`,
    name: tidy(f.description),
    category: typeof rule.as === 'function' ? rule.as(name) : rule.as,
    per,
    unknown,
    absorbsWater: (rule.as === 'grain' && !has(name, 'flour', 'bread', 'bran', 'germ')) || (rule.as === 'legume' && has(name, 'mature seeds')),
    asIs: rule.asIs === true || (rule.as === 'dairy') || (typeof rule.as === 'function' && rule.as(name) === 'dairy'),
    ref: `FDC ${id}`,
  });
}
out.sort((a, b) => a.name.localeCompare(b.name));

if (statsOnly) {
  const byCat = {};
  for (const o of out) byCat[o.category] = (byCat[o.category] ?? 0) + 1;
  console.log(out.length, 'foods', byCat);
  console.log('with any unknown nutrient:', out.filter((o) => o.unknown.length > 0).length);
  process.exit(0);
}

// Compact rows; src/data/usdaFoods.ts expands them into Ingredients.
const lines = out.map((o) => JSON.stringify([o.id, o.name, o.category, o.per, o.unknown, o.absorbsWater ? 1 : 0, o.asIs ? 1 : 0, o.ref]));
writeFileSync(join(process.cwd(), 'src/data/usdaFoodsData.ts'), `// GENERATED by scripts/build-usda-foods.mjs from USDA FoodData Central
// SR Legacy (2018-04) CSV. Do not edit by hand; rerun the script instead.
// Row: [id, name, category, per 100 g raw, unknown nutrients, absorbs water, eaten as is, source]
/* eslint-disable */
export const USDA_ROWS = [
${lines.join(',\n')},
] as const;
`);
console.log(`wrote ${out.length} foods`);
