import { describe, expect, it } from 'vitest';
import { bayesianScore, distanceMeters, isOpenAt, matchesLocation } from '../src/server/domain';
import {
  addTag,
  buildSearchParams,
  DEFAULT_FILTERS,
  filterAndSort,
  parseSearchParams,
  safeHttpUrl,
  searchSchema,
  validateFilters,
} from '../src/shared/search';
import { DEPARTMENTS, locationQuery, normalizeLocation } from '../src/shared/locations';
import { place, query } from './fixtures';

describe('ranking and distance', () => {
  it('keeps the historical Bayesian formula', () => {
    expect(bayesianScore(0, 0)).toBe(3.9);
    expect(bayesianScore(5, 2)).toBeCloseTo(4.08333);
    expect(bayesianScore(4.7, 200)).toBeGreaterThan(bayesianScore(5, 2));
    expect(bayesianScore(4.7, 1000000)).toBeCloseTo(4.7, 4);
  });
  it('handles identical coordinates, equator and antipodes', () => {
    expect(distanceMeters(0, 0, 0, 0)).toBe(0);
    expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(111194.93, 1);
    expect(Number.isFinite(distanceMeters(90, 0, -90, 180))).toBe(true);
  });
  it('preserves decimal thresholds and does not mistake unknown opening for closed', () => {
    const list = [
      place,
      { ...place, placeId: 'lower', rating: 4.4 },
      { ...place, placeId: 'unknown', openNow: null },
    ];
    expect(
      filterAndSort(list, { ...DEFAULT_FILTERS, ratingMin: '4.5' }).map((p) => p.placeId),
    ).not.toContain('lower');
    expect(filterAndSort(list, { ...DEFAULT_FILTERS, open: 'closed' })).toHaveLength(0);
    expect(filterAndSort(list, { ...DEFAULT_FILTERS, open: 'open' })).toHaveLength(2);
  });
  it('sorts distances ascending with unknown distances last without mutating input', () => {
    const list = [
      { ...place, distance: null },
      { ...place, placeId: 'near', distance: 2 },
    ];
    expect(filterAndSort(list, { ...DEFAULT_FILTERS, sort: 'distance' })[0].placeId).toBe('near');
    expect(list[0].distance).toBeNull();
  });
  it('rejects inverted ranges and non-finite values', () => {
    expect(
      validateFilters({ ...DEFAULT_FILTERS, ratingMin: '4.8', ratingMax: '4.2' }),
    ).toBeTruthy();
    expect(validateFilters({ ...DEFAULT_FILTERS, reviewsMin: '1.5' })).toBeTruthy();
    expect(validateFilters({ ...DEFAULT_FILTERS, reviewsMax: 'Infinity' })).toBeTruthy();
  });
});
describe('French locations', () => {
  it.each([
    ['Essonne', '91'],
    ['val-d’oise', '95'],
    ['2a', '2A'],
    ['Paris 1er', '75001'],
    ['15ème', '75015'],
    ['Paris 20e', '75020'],
    ['21e', '21e'],
    ['La Réunion', '974'],
  ])('normalizes %s to %s', (input, output) => expect(normalizeLocation(input)).toBe(output));
  it('preserves all 101 local department suggestions', () => expect(DEPARTMENTS).toHaveLength(101));
  it('expands department codes in the provider query', () =>
    expect(locationQuery('91')).toBe('Essonne, France'));
  it.each([
    ['1 Rue de Paris, 69001 Lyon, France', 'Paris', false],
    ['1 Rue de Paris, 69001 Lyon, France', 'Lyon', true],
    ['91 Rue Exemple, 75001 Paris, France', '91', false],
    ['1 Rue Exemple, 91000 Évry-Courcouronnes, France', '91', true],
    ['1 Rue Exemple, 75001 Paris, France', '75001', true],
    ['1 Rue Exemple, 97100 Basse-Terre, France', '971', true],
    ['1 Rue Exemple, 20000 Ajaccio, France', '2A', true],
    ['1 Rue Exemple, 20600 Bastia, France', '2B', true],
    ['1 Rue Exemple, 20200 Bastia, France', '2A', false],
  ])('matches %s to %s: %s', (address, filter, result) =>
    expect(matchesLocation(address, filter)).toBe(result),
  );
  it('deduplicates normalized tags and enforces limits', () => {
    expect(addTag(['91'], 'Essonne', 3, true)).toEqual(['91']);
    expect(addTag(['A', 'B', 'C'], 'D', 3)).toEqual(['A', 'B', 'C']);
    expect(addTag([], 'Paris,Lyon', 3, true)).toEqual([]);
  });
});
describe('weekly opening periods', () => {
  const overnight = [{ open: { day: 6, time: '2200' }, close: { day: 0, time: '0200' } }];
  it('handles overnight periods over the week boundary', () => {
    expect(isOpenAt(overnight, 6, 22 * 60)).toBe(true);
    expect(isOpenAt(overnight, 0, 60)).toBe(true);
    expect(isOpenAt(overnight, 0, 120)).toBe(false);
    expect(isOpenAt(overnight, 6, 21 * 60)).toBe(false);
  });
  it('distinguishes unknown, 24/7, and malformed missing closing times', () => {
    expect(isOpenAt(null, 1, 600)).toBeNull();
    expect(isOpenAt([], 1, 600)).toBeNull();
    expect(isOpenAt([{ open: { day: 0, time: '0000' } }], 3, 500)).toBe(true);
    expect(isOpenAt([{ open: { day: 3, time: '1200' } }], 4, 500)).toBe(false);
  });
  it('handles split shifts', () => {
    const shifts = [
      { open: { day: 1, time: '0900' }, close: { day: 1, time: '1200' } },
      { open: { day: 1, time: '1400' }, close: { day: 1, time: '1800' } },
    ];
    expect(isOpenAt(shifts, 1, 13 * 60)).toBe(false);
    expect(isOpenAt(shifts, 1, 17 * 60)).toBe(true);
  });
});
describe('search contracts and legacy URLs', () => {
  it.each([
    { lat: '' },
    { lat: '91' },
    { lng: '181' },
    { lat: 'NaN' },
    { q: ['café'] },
    { radius: '-1' },
    { city: 'A,B,C,D' },
    { day: '1' },
    { time: '12:30' },
    { day: '7', time: '12:00' },
    { day: '1', time: '25:00' },
    { keywords: 'a,b,c,d,e,f' },
  ])('rejects malformed input %o', (change) =>
    expect(searchSchema.safeParse({ ...query, ...change }).success).toBe(false),
  );
  it('accepts zero coordinates and Sunday', () =>
    expect(
      searchSchema.parse({ ...query, lat: '0', lng: '0', day: '0', time: '00:00' }),
    ).toMatchObject({ lat: 0, lng: 0, day: '0' }));
  it('roundtrips every existing share field including decimals and Sunday', () => {
    const params = new URLSearchParams({
      ...query,
      address: 'Paris',
      city: '91,75001',
      keywords: 'accueil,terrasse',
      day: '0',
      time: '18:30',
      ratingMin: '4.5',
      ratingMax: '5',
      reviewsMin: '10',
      reviewsMax: '500',
      open: 'open',
      sort: 'rating',
    });
    const state = parseSearchParams(params)!;
    expect(state.draft.cities).toEqual(['91', '75001']);
    expect(parseSearchParams(buildSearchParams(state))).toEqual(state);
  });
  it('allows only http(s) external URLs', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/');
  });
});
