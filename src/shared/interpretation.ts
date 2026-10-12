import { DEFAULT_DRAFT, DEFAULT_FILTERS, PRICE_LABELS } from './search';
import type { Filters, SearchDraft, SearchInterpretation } from './types';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SORTS = {
  score: 'meilleur ratio',
  rating: 'meilleure note',
  reviewCount: 'plus d’avis',
  distance: 'plus proches',
};

/**
 * Turns an interpretation into form values. The request replaces the previous criteria, except
 * the place the user already chose when the request does not mention one.
 */
export function applyInterpretation(
  draft: SearchDraft,
  interpretation: SearchInterpretation,
): { draft: SearchDraft; filters: Filters; summary: string[] } {
  const i = interpretation;
  const placeMentioned = i.address !== '';
  const next: SearchDraft = {
    ...DEFAULT_DRAFT,
    q: i.q,
    address: placeMentioned ? i.address : draft.address,
    cities: placeMentioned ? [] : draft.cities,
    radius: i.radius ?? draft.radius,
    day: i.day,
    time: i.time,
  };
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    sort: i.sort || 'score',
    ratingMin: i.ratingMin,
    reviewsMin: i.reviewsMin,
    priceMax: i.priceMax,
    open: i.open || 'all',
  };
  const summary = [`Recherche : ${i.q}`];
  if (placeMentioned) summary.push(`Autour de : ${i.address}`);
  if (i.radius !== null) summary.push(`Rayon : ${i.radius / 1000} km`);
  if (i.day !== '') summary.push(`Ouvert le ${DAYS[Number(i.day)]} à ${i.time}`);
  if (i.open === 'open') summary.push('Ouvert maintenant');
  if (i.priceMax)
    summary.push(`Prix : ${PRICE_LABELS[i.priceMax]} maximum, lieux sans prix inclus`);
  if (i.ratingMin) summary.push(`Note minimum : ${i.ratingMin}`);
  if (i.reviewsMin) summary.push(`Avis minimum : ${i.reviewsMin}`);
  if (i.sort) summary.push(`Tri : ${SORTS[i.sort]}`);
  return { draft: next, filters, summary };
}
