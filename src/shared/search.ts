import { z } from 'zod';
import { normalize, normalizeLocation } from './locations';
import type { Filters, Place, SearchDraft, SearchState } from './types';

export const DEFAULT_FILTERS: Filters = {
  sort: 'score',
  reviewsMin: '',
  reviewsMax: '',
  ratingMin: '',
  ratingMax: '',
  open: 'all',
};
export const DEFAULT_DRAFT: SearchDraft = {
  q: '',
  address: '',
  radius: 5000,
  cities: [],
  keywords: [],
  day: '',
  time: '',
};
export const RADII = [1000, 2000, 5000, 10000, 20000, 30000, 50000];

const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number<string | number>().finite());
export const coordinatesSchema = z.object({
  lat: numeric.pipe(z.number().min(-90).max(90)),
  lng: numeric.pipe(z.number().min(-180).max(180)),
});
const csv = (max: number, length: number) =>
  z
    .string()
    .max(max * (length + 1))
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(length)).max(max));
export const searchSchema = z
  .object({
    q: z.string().trim().min(1, 'Indiquez ce que vous cherchez.').max(120),
    ...coordinatesSchema.shape,
    radius: numeric.pipe(z.number().int().min(100).max(50000)).default(5000),
    city: csv(3, 100).transform((cities) => [...new Set(cities.map(normalizeLocation))]),
    keywords: csv(5, 80),
    day: z
      .string()
      .regex(/^[0-6]?$/)
      .default(''),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/)
      .default(''),
  })
  .refine((s) => Boolean(s.day) === Boolean(s.time), {
    message: 'Renseignez le jour et l’heure ensemble.',
    path: ['time'],
  });
export type SearchInput = z.infer<typeof searchSchema>;

export function validateFilters(filters: Filters): string | null {
  for (const [low, high, max, label] of [
    [filters.ratingMin, filters.ratingMax, 5, 'notes'],
    [filters.reviewsMin, filters.reviewsMax, 100000000, 'avis'],
  ] as const) {
    for (const value of [low, high]) {
      if (
        value !== '' &&
        (!Number.isFinite(Number(value)) ||
          Number(value) < 0 ||
          Number(value) > max ||
          (label === 'avis' && !Number.isInteger(Number(value))))
      )
        return `Les ${label} doivent être compris entre 0 et ${max}.`;
    }
    if (low !== '' && high !== '' && Number(low) > Number(high))
      return `Le minimum des ${label} ne peut pas dépasser le maximum.`;
  }
  return null;
}

export function filterAndSort(places: Place[], filters: Filters): Place[] {
  return places
    .filter(
      (p) =>
        (filters.ratingMin === '' || p.rating >= Number(filters.ratingMin)) &&
        (filters.ratingMax === '' || p.rating <= Number(filters.ratingMax)) &&
        (filters.reviewsMin === '' || p.reviewCount >= Number(filters.reviewsMin)) &&
        (filters.reviewsMax === '' || p.reviewCount <= Number(filters.reviewsMax)) &&
        (filters.open === 'all' ||
          (filters.open === 'open' ? p.openNow === true : p.openNow === false)),
    )
    .sort((a, b) => {
      const difference =
        filters.sort === 'distance'
          ? (a.distance ?? Infinity) - (b.distance ?? Infinity)
          : b[filters.sort] - a[filters.sort];
      return (
        difference ||
        b.reviewCount - a.reviewCount ||
        a.name.localeCompare(b.name, 'fr') ||
        a.placeId.localeCompare(b.placeId)
      );
    });
}

export function buildSearchParams(state: SearchState): URLSearchParams {
  const { draft: d, filters: f, center } = state;
  const p = new URLSearchParams({ q: d.q.trim(), radius: String(d.radius), sort: f.sort });
  if (center) {
    p.set('lat', String(center.lat));
    p.set('lng', String(center.lng));
  }
  if (d.address.trim()) p.set('address', d.address.trim());
  if (d.cities.length) p.set('city', d.cities.join(','));
  if (d.keywords.length) p.set('keywords', d.keywords.join(','));
  if (d.day !== '' && d.time) {
    p.set('day', d.day);
    p.set('time', d.time);
  }
  for (const key of ['reviewsMin', 'reviewsMax', 'ratingMin', 'ratingMax'] as const)
    if (f[key] !== '') p.set(key, f[key]);
  if (f.open !== 'all') p.set('open', f.open);
  return p;
}

export function parseSearchParams(p: URLSearchParams): SearchState | null {
  const parsed = searchSchema.safeParse(Object.fromEntries(p));
  if (!parsed.success) return null;
  const s = parsed.data;
  const sort = p.get('sort');
  const open = p.get('open');
  const filters: Filters = {
    sort: sort === 'rating' || sort === 'reviewCount' || sort === 'distance' ? sort : 'score',
    open: open === 'open' || open === 'closed' ? open : 'all',
    reviewsMin: p.get('reviewsMin') || '',
    reviewsMax: p.get('reviewsMax') || '',
    ratingMin: p.get('ratingMin') || '',
    ratingMax: p.get('ratingMax') || '',
  };
  if (validateFilters(filters)) return null;
  return {
    draft: {
      q: s.q,
      address: (p.get('address') || '').slice(0, 300),
      radius: s.radius,
      cities: s.city,
      keywords: s.keywords,
      day: s.day,
      time: s.time,
    },
    filters,
    center: { lat: s.lat, lng: s.lng },
  };
}

export function addTag(values: string[], raw: string, max: number, location = false): string[] {
  const value = location ? normalizeLocation(raw) : raw.trim();
  if (
    !value ||
    value.includes(',') ||
    value.length > (location ? 100 : 80) ||
    values.length >= max ||
    values.some((s) => normalize(s) === normalize(value))
  )
    return values;
  return [...values, value];
}

export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
