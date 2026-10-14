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

/** A barcode: the 8 to 14 digits under the stripes on a pack. */
const BARCODE = /^\d{8,14}$/;

/**
 * Looks a food up by name, or by barcode when digits are typed. The barcode
 * lookup is the more reliable of the two: Open Food Facts' name search is
 * sometimes switched off under load, and then says so.
 */
export async function searchOpenFoodFacts(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q === '') return { ok: false, message: 'Type something to search for.' };
  const byBarcode = BARCODE.test(q.replace(/ /g, ''));

  const url = byBarcode
    ? `${OFF_ORIGIN}/api/v2/product/${q.replace(/ /g, '')}?${new URLSearchParams({ fields: FIELDS })}`
    : `${OFF_ORIGIN}/cgi/search.pl?${new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1',
      page_size: String(PAGE_SIZE), fields: FIELDS,
    })}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, message: 'Open Food Facts is busy. Wait a minute and search again.' };
      return { ok: false, message: byBarcode
        ? 'Open Food Facts could not answer just now. Please try again.'
        : "Open Food Facts' name search isn't available right now. Try again later, or type the barcode number from the pack instead." };
    }
    const body = (await res.json()) as { products?: OffProduct[]; product?: OffProduct; status?: number };
    const products = byBarcode ? (body.status === 1 && body.product !== undefined ? [body.product] : []) : (body.products ?? []);
    const foods = products.map(offToFood).filter((f): f is OffFood => f !== null);
    return { ok: true, foods };
  } catch {
    // A browser reports a refused or switched-off name search the same way as no
    // signal, so offer the barcode, which uses a different and steadier service.
    return { ok: false, message: byBarcode
      ? "Couldn't reach Open Food Facts. Check your connection and try again."
      : "Couldn't reach Open Food Facts' name search. Check your connection, or type the barcode number from the pack instead." };
  } finally {
    clearTimeout(timer);
  }
}
