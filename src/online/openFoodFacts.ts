import { offToFood, type OffFood, type OffProduct } from '../core/openFoodFacts';

/**
 * The only place the app talks to the internet. It runs only when the person
 * taps "Search online", sends only what they typed, and the CSP allows this
 * one host and nothing else.
 */
export const OFF_ORIGIN = 'https://world.openfoodfacts.org';
const TIMEOUT_MS = 12_000;
const PAGE_SIZE = 15;
const FIELDS = 'code,product_name,brands,quantity,nutrition_data_per,nutriments';

export type SearchResult =
  | { ok: true; foods: OffFood[] }
  | { ok: false; message: string };

export async function searchOpenFoodFacts(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult> {
  const q = query.trim();
  if (q === '') return { ok: false, message: 'Type something to search for.' };

  const url = `${OFF_ORIGIN}/cgi/search.pl?${new URLSearchParams({
    search_terms: q, search_simple: '1', action: 'process', json: '1',
    page_size: String(PAGE_SIZE), fields: FIELDS,
  })}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, message: res.status === 429
        ? 'Open Food Facts is busy. Wait a minute and search again.'
        : 'Open Food Facts could not answer just now. Please try again.' };
    }
    const body = (await res.json()) as { products?: OffProduct[] };
    const foods = (body.products ?? []).map(offToFood).filter((f): f is OffFood => f !== null);
    return { ok: true, foods };
  } catch {
    return { ok: false, message: "Couldn't reach Open Food Facts. Check your connection and try again." };
  } finally {
    clearTimeout(timer);
  }
}
