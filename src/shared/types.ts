export interface Coordinates {
  lat: number;
  lng: number;
}
export interface Place {
  placeId: string;
  name: string;
  address: string;
  category: string | null;
  rating: number;
  reviewCount: number;
  score: number;
  openNow: boolean | null;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  /** Google price level, 0 (free) to 4 (very expensive); null when Google gives none. */
  priceLevel: number | null;
  mapsUrl: string;
}
export interface Review {
  author: string;
  authorUrl: string | null;
  rating: number;
  relativeTime: string;
  text: string;
  photoUrl: string | null;
}
export interface PlaceDetails {
  name: string;
  rating: number;
  reviewCount: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  openNow: boolean | null;
  weekdayText: string[] | null;
  mapsUrl: string;
  reviews: Review[];
  attributions: string[];
}
export interface SearchResponse {
  count: number;
  places: Place[];
  warnings: string[];
  attributions: string[];
}
export interface PublicConfig {
  mapsApiKey: string | null;
  mapsMapId: string | null;
  searchAvailable: boolean;
  adsenseClientId: string | null;
  adsenseSlotId: string | null;
  aiAvailable: boolean;
}
export type SortKey = 'score' | 'rating' | 'reviewCount' | 'distance';
export interface Filters {
  sort: SortKey;
  reviewsMin: string;
  reviewsMax: string;
  ratingMin: string;
  ratingMax: string;
  /** '' or '1'..'4'. Soft: places without a price level are never excluded. */
  priceMax: string;
  open: 'all' | 'open' | 'closed';
}
export interface SearchDraft {
  q: string;
  address: string;
  radius: number;
  cities: string[];
  keywords: string[];
  day: string;
  time: string;
}
export interface SearchState {
  draft: SearchDraft;
  filters: Filters;
  center: Coordinates | null;
}
/** Search criteria Claude extracted from a free-text request; every field is validated server-side. */
export interface SearchInterpretation {
  q: string;
  address: string;
  radius: number | null;
  day: string;
  time: string;
  open: '' | 'open';
  sort: '' | SortKey;
  ratingMin: string;
  reviewsMin: string;
  priceMax: string;
  /** Parts of the request the app cannot filter on (ambiance, party size…). */
  unsupported: string[];
}
export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}
