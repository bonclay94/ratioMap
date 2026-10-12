import { locationQuery, normalize } from '../shared/locations';
import type { SearchInput } from '../shared/search';
import type { Place, SearchResponse } from '../shared/types';
import {
  bayesianScore,
  categoryLabel,
  distanceMeters,
  isOpenAt,
  matchesLocation,
  toMinutes,
} from './domain';
import { mapConcurrent } from './concurrency';
import type { PlacesProvider } from './google';

export async function searchPlaces(
  provider: PlacesProvider,
  input: SearchInput,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const { lat, lng, radius, q, city, keywords, day, time } = input;
  const queries = city.length ? city.map((c) => `${q} in ${locationQuery(c)}`) : [q];
  const batches = await mapConcurrent(
    queries,
    3,
    (query) => provider.search({ lat, lng }, radius, query, signal),
    signal,
  );
  const raw = [...new Map(batches.flatMap((b) => b.places).map((p) => [p.place_id, p])).values()];
  const credits = new Set(batches.flatMap((b) => b.attributions));
  const places: Place[] = [];
  for (const p of raw) {
    if (p.business_status === 'CLOSED_PERMANENTLY') continue;
    const address = p.formatted_address || p.vicinity || '';
    if (city.length && !city.some((c) => matchesLocation(address, c))) continue;
    const position = p.geometry?.location;
    const distance = position ? distanceMeters(lat, lng, position.lat, position.lng) : null;
    if (!city.length && (distance === null || distance > radius)) continue;
    places.push({
      placeId: p.place_id,
      name: p.name,
      address,
      rating: p.rating,
      reviewCount: p.user_ratings_total,
      score: Math.round(bayesianScore(p.rating, p.user_ratings_total) * 100) / 100,
      category: categoryLabel(p.types),
      openNow: p.opening_hours?.open_now ?? null,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      distance: distance === null ? null : Math.round(distance),
      priceLevel: p.price_level ?? null,
      mapsUrl: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.place_id)}`,
    });
  }
  let failures = 0;
  let unknownHours = 0;
  let finalPlaces = places;
  if (keywords.length || day !== '') {
    const normalizedKeywords = keywords.map(normalize);
    const candidates = await mapConcurrent(
      places,
      6,
      async (place) => {
        try {
          const baseText = normalize(`${place.name} ${place.category || ''}`);
          const baseMatch =
            !normalizedKeywords.length || normalizedKeywords.some((k) => baseText.includes(k));
          if (baseMatch && day === '') return place;
          const extra = await provider.extra(place.placeId, !baseMatch, day !== '', signal);
          extra.attributions.forEach((a) => credits.add(a));
          const open = day !== '' ? isOpenAt(extra.periods, Number(day), toMinutes(time)) : true;
          if (open === null) unknownHours++;
          if (open !== true) return null;
          const haystack = normalize(`${place.name} ${place.category || ''} ${extra.text}`);
          return !normalizedKeywords.length || normalizedKeywords.some((k) => haystack.includes(k))
            ? place
            : null;
        } catch (error) {
          if (signal?.aborted) throw error;
          failures++;
          return null;
        }
      },
      signal,
    );
    finalPlaces = candidates.filter((p): p is Place => p !== null);
  }
  finalPlaces.sort(
    (a, b) =>
      b.score - a.score || b.reviewCount - a.reviewCount || a.placeId.localeCompare(b.placeId),
  );
  const warnings: string[] = [];
  if (failures)
    warnings.push(
      `${failures} lieu${failures > 1 ? 'x' : ''} exclu${failures > 1 ? 's' : ''} : les informations nécessaires aux filtres n’ont pas pu être vérifiées. Vous pouvez réessayer.`,
    );
  if (unknownHours)
    warnings.push(
      `Horaires inconnus pour ${unknownHours} lieu${unknownHours > 1 ? 'x' : ''}, non inclus dans ce créneau.`,
    );
  return { count: finalPlaces.length, places: finalPlaces, warnings, attributions: [...credits] };
}
