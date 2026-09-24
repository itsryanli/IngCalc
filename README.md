# IngCalc

A phone-first, offline web app that works out what a raw ingredient becomes once
cooked: its cooked weight, its nutrients, its share of your daily calorie and
protein targets, and what it cost per gram of protein.

It follows one purchase through its whole life — bought at the market, cooked
(possibly over several sittings), split into portions, eaten — and records price,
location and date along the way so your spending can be exported and analysed.

Everything runs on your device. There is no backend and no account; data is stored
in the browser (IndexedDB) and can be backed up to a JSON file.

## Features

- **Log** — the day's calorie and protein progress against your targets, with meals
  and quick-add entries.
- **Kitchen** — batches from purchase through cooking to consumption. Mark a raw
  batch as cooked, then eat it a portion at a time.
- **Calc** — convert raw weight to cooked weight (and back), see the nutrients for
  any weight, and compare cooking methods by how much weight and nutrition they keep.
- **Costs** — a sortable purchase table with cost per portion and protein per MYR,
  totals by location and by month, CSV export, and JSON backup/restore.
- **Profile** — per-person daily calorie and protein targets from body stats.
- **Installable** — it's a PWA, so you can add it to your phone's home screen and
  use it offline.

Ingredient data comes from USDA FoodData Central, and cooking losses from the USDA
Table of Nutrient Retention Factors. Where a value is estimated rather than looked up,
the app says so.

## Getting started

You need [Node.js](https://nodejs.org/) **22.12 or newer** (see `.nvmrc`).

```bash
git clone https://github.com/itsryanli/IngCalc.git
cd IngCalc
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). To try it on your
phone, run `npm run dev -- --host` and open the network URL from a phone on the
same Wi-Fi.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the production app into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with oxlint |

`dist/` is a plain static site, so you can host it anywhere that serves files
(GitHub Pages, Netlify, Vercel, etc.).

## Tech stack

React 19, TypeScript and Vite, with Dexie over IndexedDB for storage and
`vite-plugin-pwa` for offline support. Tests use Vitest and Testing Library.

## Project layout

```
src/
  core/      Pure calculation logic: yields, nutrients, retention, targets, costs, CSV, backup
  data/      Bundled reference data: ingredients, yield and retention tables, daily values
  storage/   Dexie database schema and migrations
  ui/        React screens, components and hooks
public/      Icons
```
