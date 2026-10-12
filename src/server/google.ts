import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { safeHttpUrl } from '../shared/search';
import type { Coordinates, OpeningPeriod, PlaceDetails } from '../shared/types';
import { categoryLabel } from './domain';
import { HttpError } from './errors';
import { Semaphore } from './concurrency';

const coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const hoursPoint = z.object({
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^(?:[01]\d|2[0-3])[0-5]\d$/),
});
const hours = z.object({
  open_now: z.boolean().optional(),
  weekday_text: z.array(z.string()).optional(),
  periods: z.array(z.object({ open: hoursPoint, close: hoursPoint.optional() })).optional(),
});
const rawPlaceSchema = z.object({
  place_id: z.string().min(1),
  name: z.string(),
  formatted_address: z.string().optional(),
  vicinity: z.string().optional(),
  rating: z.number().min(0).max(5).default(0),
  user_ratings_total: z.number().int().nonnegative().default(0),
  geometry: z.object({ location: coordinates }).optional(),
  business_status: z.string().optional(),
  price_level: z.number().int().min(0).max(4).optional(),
  opening_hours: hours.optional(),
  types: z.array(z.string()).default([]),
});
export type RawPlace = z.infer<typeof rawPlaceSchema>;
const detailSchema = rawPlaceSchema.omit({ place_id: true }).extend({
  formatted_phone_number: z.string().optional(),
  international_phone_number: z.string().optional(),
  website: z.string().optional(),
  url: z.string().optional(),
  reviews: z
    .array(
      z.object({
        author_name: z.string().default('Anonyme'),
        author_url: z.string().optional(),
        rating: z.number().default(0),
        relative_time_description: z.string().default(''),
        text: z.string().default(''),
        profile_photo_url: z.string().optional(),
      }),
    )
    .default([]),
});
const envelopeSchema = z.object({
  status: z.string(),
  results: z.array(z.unknown()).optional(),
  result: z.unknown().optional(),
  next_page_token: z.string().optional(),
  html_attributions: z.array(z.string()).default([]),
});
const geocodeSchema = z.object({
  formatted_address: z.string(),
  geometry: z.object({ location: coordinates }),
  address_components: z
    .array(z.object({ types: z.array(z.string()), long_name: z.string() }))
    .default([]),
});

export interface PlaceExtra {
  text: string;
  periods: OpeningPeriod[] | null;
  attributions: string[];
}
export interface PlacesProvider {
  geocode(
    address: string,
    signal?: AbortSignal,
  ): Promise<Coordinates & { formattedAddress: string }>;
  reverseGeocode(
    lat: number,
    lng: number,
    signal?: AbortSignal,
  ): Promise<{ formattedAddress: string; city: string | null }>;
  search(
    center: Coordinates,
    radius: number,
    q: string,
    signal?: AbortSignal,
  ): Promise<{ places: RawPlace[]; attributions: string[] }>;
  details(placeId: string, signal?: AbortSignal): Promise<PlaceDetails>;
  extra(
    placeId: string,
    reviews: boolean,
    hours: boolean,
    signal?: AbortSignal,
  ): Promise<PlaceExtra>;
}
function attributions(values: string[]): string[] {
  return values.map((s) => s.replace(/<[^>]*>/g, '').slice(0, 500)).filter(Boolean);
}
export class GooglePlacesProvider implements PlacesProvider {
  private readonly slots = new Semaphore(6);
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
    private readonly pageDelayMs = 2000,
  ) {}
  private async request(path: string, params: Record<string, string>, signal?: AbortSignal) {
    if (!this.apiKey)
      throw new HttpError(
        503,
        'La recherche est temporairement indisponible. Réessayez plus tard.',
        'NOT_CONFIGURED',
      );
    const url = new URL(`https://maps.googleapis.com/maps/api/${path}/json`);
    for (const [key, value] of Object.entries({ ...params, language: 'fr', key: this.apiKey }))
      url.searchParams.set(key, value);
    const requestSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(10000),
    ]);
    return this.slots.run(async () => {
      let response: Response;
      try {
        response = await this.fetcher(url, { signal: requestSignal });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new HttpError(
          504,
          'Google met trop de temps à répondre. Réessayez.',
          'UPSTREAM_TIMEOUT',
        );
      }
      if (!response.ok)
        throw new HttpError(
          502,
          'Le service de recherche ne répond pas correctement.',
          'UPSTREAM_ERROR',
        );
      const parsed = envelopeSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new HttpError(
          502,
          'Le service de recherche a renvoyé une réponse incomplète.',
          'UPSTREAM_FORMAT',
        );
      const data = parsed.data;
      if (data.status === 'OVER_QUERY_LIMIT')
        throw new HttpError(
          503,
          'Le service de recherche est très sollicité. Réessayez plus tard.',
          'UPSTREAM_QUOTA',
        );
      if (data.status === 'REQUEST_DENIED')
        throw new HttpError(
          503,
          'La recherche est temporairement indisponible.',
          'UPSTREAM_DENIED',
        );
      if (!['OK', 'ZERO_RESULTS', 'INVALID_REQUEST', 'NOT_FOUND'].includes(data.status))
        throw new HttpError(
          502,
          'Le service de recherche est momentanément indisponible.',
          'UPSTREAM_ERROR',
        );
      return data;
    }, requestSignal);
  }
  async geocode(address: string, signal?: AbortSignal) {
    const data = await this.request('geocode', { address, region: 'fr' }, signal);
    const parsed = geocodeSchema.safeParse(data.results?.[0]);
    if (data.status !== 'OK' || !parsed.success)
      throw new HttpError(
        404,
        'Adresse introuvable. Essayez avec la ville et le code postal.',
        'ADDRESS_NOT_FOUND',
      );
    return { ...parsed.data.geometry.location, formattedAddress: parsed.data.formatted_address };
  }
  async reverseGeocode(lat: number, lng: number, signal?: AbortSignal) {
    const data = await this.request('geocode', { latlng: `${lat},${lng}` }, signal);
    const parsed = geocodeSchema.safeParse(data.results?.[0]);
    if (!parsed.success || data.status !== 'OK')
      throw new HttpError(404, 'Aucune adresse trouvée à cette position.', 'ADDRESS_NOT_FOUND');
    const r = parsed.data;
    const city =
      r.address_components.find((c) => c.types.includes('locality')) ||
      r.address_components.find((c) => c.types.includes('postal_town'));
    return { formattedAddress: r.formatted_address, city: city?.long_name || null };
  }
  async search(center: Coordinates, radius: number, q: string, signal?: AbortSignal) {
    const places: RawPlace[] = [];
    const credits = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const params: Record<string, string> = {
        query: q,
        location: `${center.lat},${center.lng}`,
        radius: String(radius),
      };
      if (pageToken) {
        await delay(this.pageDelayMs, undefined, { signal });
        params.pagetoken = pageToken;
      }
      let data = await this.request('place/textsearch', params, signal);
      if (pageToken && data.status === 'INVALID_REQUEST') {
        await delay(this.pageDelayMs, undefined, { signal });
        data = await this.request('place/textsearch', params, signal);
      }
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')
        throw new HttpError(
          502,
          'La recherche n’a pas pu être terminée. Réessayez.',
          'UPSTREAM_ERROR',
        );
      for (const raw of data.results || []) {
        const parsed = rawPlaceSchema.safeParse(raw);
        if (parsed.success) places.push(parsed.data);
      }
      attributions(data.html_attributions).forEach((a) => credits.add(a));
      pageToken = data.next_page_token;
      if (!pageToken) break;
    }
    return { places, attributions: [...credits] };
  }
  async details(placeId: string, signal?: AbortSignal): Promise<PlaceDetails> {
    const fields =
      'name,rating,user_ratings_total,formatted_address,formatted_phone_number,international_phone_number,website,opening_hours,types,url,reviews';
    const data = await this.request('place/details', { place_id: placeId, fields }, signal);
    if (data.status === 'NOT_FOUND')
      throw new HttpError(404, 'Ce lieu n’est plus disponible.', 'PLACE_NOT_FOUND');
    const parsed = detailSchema.safeParse(data.result);
    if (data.status !== 'OK' || !parsed.success)
      throw new HttpError(
        502,
        'Les détails de ce lieu ne sont pas disponibles pour le moment.',
        'DETAILS_UNAVAILABLE',
      );
    const r = parsed.data;
    return {
      name: r.name,
      rating: r.rating,
      reviewCount: r.user_ratings_total,
      address: r.formatted_address || null,
      phone: r.formatted_phone_number || r.international_phone_number || null,
      website: safeHttpUrl(r.website),
      category: categoryLabel(r.types),
      openNow: r.opening_hours?.open_now ?? null,
      weekdayText: r.opening_hours?.weekday_text || null,
      mapsUrl:
        safeHttpUrl(r.url) ||
        `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
      reviews: r.reviews.slice(0, 5).map((r) => ({
        author: r.author_name,
        authorUrl: safeHttpUrl(r.author_url),
        rating: r.rating,
        relativeTime: r.relative_time_description,
        text: r.text,
        photoUrl: safeHttpUrl(r.profile_photo_url),
      })),
      attributions: attributions(data.html_attributions),
    };
  }
  async extra(
    placeId: string,
    withReviews: boolean,
    withHours: boolean,
    signal?: AbortSignal,
  ): Promise<PlaceExtra> {
    const fields = [
      'name',
      'types',
      ...(withReviews ? ['reviews'] : []),
      ...(withHours ? ['opening_hours'] : []),
    ].join(',');
    const data = await this.request('place/details', { place_id: placeId, fields }, signal);
    const parsed = detailSchema.safeParse(data.result);
    if (data.status !== 'OK' || !parsed.success)
      throw new HttpError(
        502,
        'Certaines informations n’ont pas pu être vérifiées.',
        'DETAILS_UNAVAILABLE',
      );
    const r = parsed.data;
    return {
      text: [
        r.name,
        categoryLabel(r.types),
        ...r.types,
        ...(withReviews ? r.reviews.map((r) => r.text) : []),
      ].join(' '),
      periods: r.opening_hours?.periods || null,
      attributions: attributions(data.html_attributions),
    };
  }
}
