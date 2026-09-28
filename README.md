# IngCalc

A phone-first, offline web app that works out what a raw ingredient becomes once
cooked: its cooked weight, its nutrients, its share of your daily calorie and
protein targets, and what it cost per gram of protein.

## Why I built this

IngCalc is actually short form for "Ingredients Calculator" (I know its kinda lame, I just couldn't come up with a better name). I was tired of searching for every single ingredient, one at a time, whenever I
wanted to know its nutritional value. Whether I was standing at the market deciding
what to buy or back home with a bag of groceries, it was the same routine: look up
chicken breast, then bayam, then tofu, and so on, piecing together numbers from
different websites.

Even when I found the numbers, they rarely answered the question I actually had.
Most sources give values per 100 g of *raw* food, but I eat it *cooked*. Cooking
changes the weight (meat loses water, rice absorbs it) and some nutrients leach out.
So "how much protein is on my plate?" meant more searching and more arithmetic.

IngCalc keeps all of that in one place, in my pocket:

- **Before buying:** pick an ingredient and a weight to see its nutrients, and
  compare cooking methods right away.
- **After buying:** log the purchase with its price and location, mark it as cooked,
  and eat it portion by portion. Each portion shows its real, cooked nutrition.
- **Over time:** see what each purchase was worth in protein per MYR, and export
  the history.

The ingredient data is bundled with the app, so lookups are instant and work
offline, even at a market with no signal.

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

You need [Node.js](https://nodejs.org/) **22.12 or newer** (see `.nvmrc`; with nvm,
run `nvm install && nvm use`). On older Node versions the build tools fail with
"Cannot find native binding".

```bash
git clone https://github.com/itsryanli/IngCalc.git
cd IngCalc
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Using it on your phone

IngCalc is meant for your phone. There are two ways to get it there.

### Quick test over Wi-Fi

```bash
npm run dev -- --host
```

Open the "Network" address Vite prints (like `http://192.168.x.x:5173`) in your
phone's browser while the phone is on the same Wi-Fi as your computer.

This only works while your computer is running that command. Phones only allow
installing a web app and using it offline over HTTPS, and this address is plain
HTTP. It's good for a quick look, not for use at the market.

### Host it and install it (recommended)

The app is a static site with no server, so you can host it for free. Your data
still stays on your phone, because the app only saves to the phone's browser storage.

1. **Deploy it.** Fork or clone this repo, then connect it to a free static host
   such as [Netlify](https://www.netlify.com/), [Vercel](https://vercel.com/) or
   [Cloudflare Pages](https://pages.cloudflare.com/). Use these settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node version: 22.12 or newer (most hosts pick this up from `.nvmrc` or `package.json`)

   You get an HTTPS link, and the site rebuilds whenever you push to the connected
   branch.
2. **Open that link on your phone and install it:**
   - **iPhone (Safari):** Share button → **Add to Home Screen**
   - **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**)
3. **Open it from the home-screen icon.** After the first load it works offline.

> **GitHub Pages** also works. The included workflow
> (`.github/workflows/deploy.yml`) builds the app and publishes it on every push
> to `main`. In the repo's **Settings → Pages**, set **Source** to
> **GitHub Actions**. Don't use "Deploy from a branch": that publishes the
> unbuilt source code, which shows as a blank white page.

### Keeping your data safe

- Data is saved per site address. If you move to a different link, the app starts
  empty there. In the **Costs** tab, tap **Download backup (JSON)** on the old
  link, then **Restore from backup…** on the new one.
- On iPhone, Safari can clear stored data for sites you haven't opened in a few
  weeks. Installing the app to the home screen avoids this, and a JSON backup now
  and then is a good safety net.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the production app into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with oxlint |

`dist/` is a plain static site, so you can host it anywhere that serves files.
See [Using it on your phone](#using-it-on-your-phone).

## Tech stack, and why

| Choice | Why |
|---|---|
| **A web app (PWA), not a native app** | One codebase runs on any phone or laptop. You can try it without an app store, install it to your home screen, and use it offline with `vite-plugin-pwa`. |
| **No backend, no accounts** | The app is used at the market, often with poor signal, so everything runs on the device. Your food and spending data never leaves it. A JSON backup covers the "lost my phone" case without a server to run or pay for. |
| **TypeScript** | The typical bug in this domain isn't a crash. It's a believable wrong number: grams mixed up with kilograms, raw with cooked, per-100 g with per-portion, or price per kg with price paid. Branded types such as `Grams` and `MYR` turn those mix-ups into build errors. |
| **React** | The screens are mostly forms and live results that update as you type. React's component model fits that, and it's widely known, so the code is easy for others to read. |
| **Vite** | Fast dev server and builds with very little config, plus the PWA plugin and Vitest built on the same toolchain. |
| **Dexie over IndexedDB** | IndexedDB is the browser's real database, but its raw API is awkward. Dexie adds a cleaner API, live queries for React, and versioned schema migrations, so new app versions never drop existing data. |
| **Vitest + Testing Library** | The numbers have to be right, so the calculation code has extensive tests. `src/core` is pure TypeScript with no React or database imports (a test enforces this), which makes it fast and simple to test. |
| **Few extra libraries** | CSV is written directly, and costs are a sortable table rather than charts. Every dependency is something to maintain and ship to the phone, so the app avoids them where plain code does the job. |

## Project layout

```
src/
  core/      Pure calculation logic: yields, nutrients, retention, targets, costs, CSV, backup
  data/      Bundled reference data: ingredients, yield and retention tables, daily values
  storage/   Dexie database schema and migrations
  ui/        React screens, components and hooks
public/      Icons
```
