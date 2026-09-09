import { describe, expect, it, vi } from 'vitest';
import { searchPlaces } from '../src/server/search-service';
import { searchSchema } from '../src/shared/search';
import { fakeProvider, query, rawPlace } from './fixtures';

describe('search orchestration', () => {
  it('deduplicates by ID and excludes out-of-radius, unlocated, permanently closed places', async () => {
    const provider = fakeProvider();
    vi.mocked(provider.search).mockResolvedValue({
      places: [
        rawPlace,
        rawPlace,
        { ...rawPlace, place_id: 'far', geometry: { location: { lat: 0, lng: 0 } } },
        { ...rawPlace, place_id: 'unknown', geometry: undefined },
        { ...rawPlace, place_id: 'closed', business_status: 'CLOSED_PERMANENTLY' },
      ],
      attributions: ['Source'],
    });
    const result = await searchPlaces(provider, searchSchema.parse(query));
    expect(result.count).toBe(1);
    expect(result.places[0].placeId).toBe(rawPlace.place_id);
    expect(result.attributions).toEqual(['Source']);
    expect(provider.extra).not.toHaveBeenCalled();
  });
  it('searches each selected area using its name, bypassing the radius but checking its postal code', async () => {
    const provider = fakeProvider();
    vi.mocked(provider.search).mockResolvedValue({
      places: [
        { ...rawPlace, formatted_address: '1 Rue Exemple, 91000 Évry-Courcouronnes, France' },
      ],
      attributions: [],
    });
    const result = await searchPlaces(
      provider,
      searchSchema.parse({ ...query, lat: '0', lng: '0', city: '91,75' }),
    );
    expect(result.count).toBe(1);
    expect(provider.search).toHaveBeenCalledWith(
      expect.anything(),
      5000,
      'café in Essonne, France',
      undefined,
    );
    expect(provider.search).toHaveBeenCalledTimes(2);
  });
  it('combines review and hours enrichment into a single call per place', async () => {
    const provider = fakeProvider();
    const result = await searchPlaces(
      provider,
      searchSchema.parse({ ...query, keywords: 'TERRASSE', day: '0', time: '01:00' }),
    );
    expect(result.count).toBe(1);
    expect(provider.extra).toHaveBeenCalledTimes(1);
    expect(provider.extra).toHaveBeenCalledWith(rawPlace.place_id, true, true, undefined);
  });
  it('reports incomplete enrichment rather than silently pretending every nonmatch was checked', async () => {
    const provider = fakeProvider();
    vi.mocked(provider.extra).mockRejectedValue(new Error('unavailable'));
    const result = await searchPlaces(
      provider,
      searchSchema.parse({ ...query, keywords: 'terrasse' }),
    );
    expect(result.count).toBe(0);
    expect(result.warnings[0]).toContain('n’ont pas pu être vérifiées');
  });
  it('avoids paid review lookups when the name already matches a keyword', async () => {
    const provider = fakeProvider();
    const result = await searchPlaces(provider, searchSchema.parse({ ...query, keywords: 'café' }));
    expect(result.count).toBe(1);
    expect(provider.extra).not.toHaveBeenCalled();
  });
  it('bounds enrichment concurrency to six and does not swallow cancellations', async () => {
    const provider = fakeProvider();
    let active = 0;
    let max = 0;
    vi.mocked(provider.search).mockResolvedValue({
      places: Array.from({ length: 20 }, (_, i) => ({ ...rawPlace, place_id: `place-${i}` })),
      attributions: [],
    });
    vi.mocked(provider.extra).mockImplementation(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return { text: 'terrasse', periods: null, attributions: [] };
    });
    expect(
      (await searchPlaces(provider, searchSchema.parse({ ...query, keywords: 'terrasse' }))).count,
    ).toBe(20);
    expect(max).toBe(6);
    const abort = new AbortController();
    abort.abort();
    await expect(
      searchPlaces(provider, searchSchema.parse(query), abort.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
