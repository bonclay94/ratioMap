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
}
export type SortKey = 'score' | 'rating' | 'reviewCount' | 'distance';
export interface Filters {
  sort: SortKey;
  reviewsMin: string;
  reviewsMax: string;
  ratingMin: string;
  ratingMax: string;
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
export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}
