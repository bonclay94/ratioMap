import { normalize } from '../shared/locations';
import type { OpeningPeriod } from '../shared/types';

export function bayesianScore(rating: number, reviews: number): number {
  return (rating * reviews + 3.9 * 10) / (reviews + 10);
}
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
export function matchesLocation(address: string, filter: string): boolean {
  const postal = address.match(/\b\d{5}\b/)?.[0];
  if (filter === '2A') return Boolean(postal && /^(200|201)/.test(postal));
  if (filter === '2B') return Boolean(postal && /^(202|206)/.test(postal));
  if (/^\d{2,5}$/.test(filter)) return Boolean(postal?.startsWith(filter));
  // Match the locality part, not a street named after a different town.
  const parts = address.split(',').map((s) => s.trim());
  const locality =
    parts.find((s) => /\b\d{5}\b/.test(s))?.replace(/^.*?\b\d{5}\b\s*/, '') ||
    parts.at(-2) ||
    address;
  return normalize(locality).replace(/\s+cedex.*$/, '') === normalize(filter);
}
export function toMinutes(time: string): number {
  const t = time.replace(':', '');
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(2));
}
export function isOpenAt(
  periods: OpeningPeriod[] | null,
  day: number,
  minutes: number,
): boolean | null {
  if (!periods?.length) return null;
  const week = 7 * 1440;
  const target = day * 1440 + minutes;
  return periods.some(({ open, close }) => {
    if (!close) return open.day === 0 && open.time === '0000';
    const start = open.day * 1440 + toMinutes(open.time);
    let end = close.day * 1440 + toMinutes(close.time);
    if (end <= start) end += week;
    return (target >= start && target < end) || (target + week >= start && target + week < end);
  });
}
const TYPE_LABELS: Record<string, string> = {
  dentist: 'Dentiste',
  doctor: 'Médecin',
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  plumber: 'Plombier',
  electrician: 'Électricien',
  lawyer: 'Avocat',
  hair_care: 'Coiffeur',
  beauty_salon: 'Salon de beauté',
  gym: 'Salle de sport',
  physiotherapist: 'Kinésithérapeute',
  veterinary_care: 'Vétérinaire',
  bakery: 'Boulangerie',
  car_repair: 'Garage automobile',
  real_estate_agency: 'Agence immobilière',
  insurance_agency: 'Assurance',
  optician: 'Opticien',
  pharmacy: 'Pharmacie',
  lodging: 'Hébergement',
  store: 'Commerce',
  supermarket: 'Supermarché',
  park: 'Parc',
  florist: 'Fleuriste',
  book_store: 'Librairie',
  hospital: 'Hôpital',
  school: 'École',
  spa: 'Spa',
  meal_takeaway: 'À emporter',
  food: 'Alimentation',
  health: 'Santé',
  car_wash: 'Lavage automobile',
  bank: 'Banque',
  museum: 'Musée',
  tourist_attraction: 'Lieu à visiter',
  shopping_mall: 'Centre commercial',
  shoe_store: 'Magasin de chaussures',
  clothing_store: 'Vêtements',
  laundry: 'Pressing',
  accounting: 'Comptabilité',
  locksmith: 'Serrurier',
  moving_company: 'Déménageur',
  roofing_contractor: 'Couvreur',
  painter: 'Peintre',
  travel_agency: 'Agence de voyage',
  campground: 'Camping',
  pet_store: 'Animalerie',
  car_rental: 'Location de voitures',
  parking: 'Parking',
  library: 'Bibliothèque',
  local_government_office: 'Service public',
  post_office: 'Bureau de poste',
  police: 'Police',
  fire_station: 'Caserne de pompiers',
  funeral_home: 'Pompes funèbres',
  electronics_store: 'Électronique',
  furniture_store: 'Ameublement',
  home_goods_store: 'Maison',
  hardware_store: 'Bricolage',
  bicycle_store: 'Vélos',
  night_club: 'Discothèque',
  movie_theater: 'Cinéma',
  bowling_alley: 'Bowling',
  stadium: 'Stade',
  amusement_park: 'Parc de loisirs',
  art_gallery: 'Galerie d’art',
  aquarium: 'Aquarium',
  zoo: 'Zoo',
  university: 'Université',
  secondary_school: 'Collège / lycée',
  primary_school: 'École primaire',
  bus_station: 'Gare routière',
  train_station: 'Gare',
  subway_station: 'Métro',
  airport: 'Aéroport',
  gas_station: 'Station-service',
  car_dealer: 'Concessionnaire',
  convenience_store: 'Épicerie',
  liquor_store: 'Caviste',
  jewelry_store: 'Bijouterie',
  department_store: 'Grand magasin',
  storage: 'Garde-meubles',
  establishment: 'Établissement',
  point_of_interest: 'Lieu',
};
export function categoryLabel(types: string[] = []): string | null {
  return types.map((type) => TYPE_LABELS[type]).find(Boolean) || null;
}
