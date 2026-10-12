import { vi } from 'vitest';
import type { Place, PlaceDetails } from '../src/shared/types';
import type { PlacesProvider, RawPlace } from '../src/server/google';

export const place: Place = {
  placeId: 'place-one',
  name: 'Le Café des tests',
  address: '10 Rue Exemple, 75001 Paris, France',
  category: 'Café',
  rating: 4.7,
  reviewCount: 200,
  score: 4.66,
  openNow: true,
  lat: 48.8566,
  lng: 2.3522,
  distance: 100,
  priceLevel: null,
  mapsUrl: 'https://www.google.com/maps/place/?q=place_id:place-one',
};
export const rawPlace: RawPlace = {
  place_id: place.placeId,
  name: place.name,
  formatted_address: place.address,
  rating: place.rating,
  user_ratings_total: place.reviewCount,
  geometry: { location: { lat: place.lat!, lng: place.lng! } },
  types: ['cafe'],
  opening_hours: { open_now: true },
};
export const details: PlaceDetails = {
  name: place.name,
  rating: place.rating,
  reviewCount: place.reviewCount,
  address: place.address,
  category: 'Café',
  phone: '01 23 45 67 89',
  website: 'https://example.com',
  openNow: true,
  weekdayText: ['Lundi : 09:00 – 18:00'],
  mapsUrl: place.mapsUrl,
  reviews: [
    {
      author: 'Camille',
      authorUrl: 'https://www.google.com/maps/contrib/example',
      rating: 5,
      text: 'Un accueil chaleureux.',
      relativeTime: 'il y a un mois',
      photoUrl: null,
    },
  ],
  attributions: [],
};
export function fakeProvider(): PlacesProvider {
  return {
    geocode: vi.fn(async () => ({ lat: 48.8566, lng: 2.3522, formattedAddress: 'Paris, France' })),
    reverseGeocode: vi.fn(async () => ({ formattedAddress: 'Paris, France', city: 'Paris' })),
    search: vi.fn(async () => ({ places: [rawPlace], attributions: [] })),
    details: vi.fn(async () => details),
    extra: vi.fn(async () => ({
      text: 'Café accueil terrasse',
      periods: [{ open: { day: 0, time: '0000' } }],
      attributions: [],
    })),
  };
}
export const query = { q: 'café', lat: '48.8566', lng: '2.3522', radius: '5000' };
