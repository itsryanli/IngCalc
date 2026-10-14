import { describe, it, expect, vi } from 'vitest';
import { searchOpenFoodFacts } from './openFoodFacts';

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

describe('searchOpenFoodFacts', () => {
  it('sends only what was typed to Open Food Facts and returns usable foods', async () => {
    const fetchFn = reply(200, { products: [
      { code: '1', product_name: 'Milo Kotak', brands: 'Nestlé', nutriments: { 'energy-kcal_100g': 70 } },
      { code: '', product_name: 'no barcode' },
    ] });
    const r = await searchOpenFoodFacts(' milo kotak ', fetchFn as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, foods: [expect.objectContaining({ name: 'Milo Kotak', brand: 'Nestlé' })] });
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.origin).toBe('https://world.openfoodfacts.org');
    expect(url.searchParams.get('search_terms')).toBe('milo kotak');
  });

  it('says plainly when the service is busy or unreachable', async () => {
    expect(await searchOpenFoodFacts('milo', reply(429, {}) as unknown as typeof fetch))
      .toEqual({ ok: false, message: 'Open Food Facts is busy. Wait a minute and search again.' });
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await searchOpenFoodFacts('milo', offline as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/couldn't reach.*barcode/i);
  });

  it('does not search for nothing', async () => {
    const fetchFn = vi.fn();
    expect((await searchOpenFoodFacts('  ', fetchFn as unknown as typeof fetch)).ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('looks a barcode up directly, which works when name search does not', async () => {
    const fetchFn = reply(200, { status: 1, product: { code: '9300605126527', product_name: 'Milo', brands: 'Nestlé', nutriments: { 'energy-kcal_100g': 400 } } });
    const r = await searchOpenFoodFacts(' 9300605 126527 ', fetchFn as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, foods: [expect.objectContaining({ code: '9300605126527', name: 'Milo' })] });
    expect(new URL(fetchFn.mock.calls[0]![0] as string).pathname).toBe('/api/v2/product/9300605126527');
  });

  it('finds nothing for an unknown barcode', async () => {
    const r = await searchOpenFoodFacts('00000000', reply(200, { status: 0 }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, foods: [] });
  });

  it('suggests the barcode when name search is switched off', async () => {
    const r = await searchOpenFoodFacts('milo', reply(503, {}) as unknown as typeof fetch);
    expect(!r.ok && r.message).toMatch(/name search isn't available.*barcode/);
  });
});
