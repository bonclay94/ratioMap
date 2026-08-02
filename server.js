require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { getStore } = require('@netlify/blobs');

const app = express();
const PORT = process.env.PORT || 3000;

// Deux clés distinctes :
// - API_KEY : utilisée uniquement côté serveur (Geocoding, Places...), jamais
//   envoyée au navigateur. Peut rester sans restriction de referrer/IP.
// - BROWSER_KEY : la seule exposée au client (chargement de Maps JavaScript
//   API + Autocomplete). Doit être restreinte par référent HTTP à ton domaine
//   dans Google Cloud Console, puisqu'elle est visible en clair côté navigateur.
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BROWSER_KEY = process.env.GOOGLE_MAPS_BROWSER_KEY;

if (!API_KEY) {
  console.error('GOOGLE_MAPS_API_KEY manquante. Copie .env.example vers .env et renseigne ta clé.');
  // En local uniquement : sur Netlify, une fonction ne doit pas tuer le process.
  if (require.main === module) process.exit(1);
}

if (!BROWSER_KEY) {
  console.error('GOOGLE_MAPS_BROWSER_KEY manquante : la carte et l\'autocomplete ne pourront pas se charger côté navigateur.');
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Liens courts pour la recherche partagée ---
// Netlify Blobs en production ; repli en mémoire en local (node server.js
// direct, hors environnement Netlify) où Blobs n'est pas disponible.
const memoryShortLinks = new Map();

function getShortLinkStore() {
  try {
    return getStore('short-links');
  } catch {
    return null;
  }
}

function generateShortId() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 7);
}

async function saveShortLink(id, data) {
  const store = getShortLinkStore();
  if (store) {
    try {
      await store.setJSON(id, data);
      return;
    } catch {
      // Repli mémoire ci-dessous si Blobs échoue pour une raison quelconque.
    }
  }
  memoryShortLinks.set(id, data);
}

async function loadShortLink(id) {
  const store = getShortLinkStore();
  if (store) {
    try {
      const data = await store.get(id, { type: 'json' });
      if (data) return data;
    } catch {
      // Repli mémoire ci-dessous.
    }
  }
  return memoryShortLinks.get(id) || null;
}

app.post('/api/shorten', async (req, res) => {
  try {
    const params = req.body;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return res.status(400).json({ error: 'Corps de requête invalide' });
    }

    const id = generateShortId();
    await saveShortLink(id, params);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/s/:id', async (req, res) => {
  try {
    const data = await loadShortLink(req.params.id);
    if (!data) return res.redirect('/');

    const params = new URLSearchParams(data);
    res.redirect(`/?${params}`);
  } catch {
    res.redirect('/');
  }
});

// Constante de confiance et note moyenne a priori pour le score bayésien.
// Rien n'est exclu : un lieu sans avis retombe simplement sur cette moyenne.
const PRIOR_COUNT = 10;
const PRIOR_MEAN = 3.9;

function bayesianScore(rating, reviewCount) {
  return (reviewCount * rating + PRIOR_COUNT * PRIOR_MEAN) / (reviewCount + PRIOR_COUNT);
}

// Distance en mètres entre deux points (formule de Haversine). Le paramètre
// "radius" de Google Text Search n'est qu'une préférence, pas une limite
// stricte : Google renvoie parfois des résultats plus loin quand la zone est
// peu fournie. On applique donc nous-mêmes la coupe exacte, pour que les pins
// correspondent toujours au cercle affiché sur la carte.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocodeAddress(address) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('language', 'fr');

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Géocodage impossible (${data.status})`);
  }

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

async function reverseGeocode(lat, lng) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('language', 'fr');

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Géocodage inversé impossible (${data.status})`);
  }

  const result = data.results[0];
  const components = result.address_components || [];
  const findComponent = (type) => components.find((c) => c.types.includes(type));
  const city =
    findComponent('locality') ||
    findComponent('postal_town') ||
    findComponent('administrative_area_level_2');

  return {
    formattedAddress: result.formatted_address,
    city: city ? city.long_name : null,
  };
}

function normalize(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Une entr\u00e9e "ville" peut aussi \u00eatre un code d\u00e9partement fran\u00e7ais (2 chiffres,
// ou 3 pour les DOM comme 971). Dans ce cas on compare au pr\u00e9fixe du code
// postal plut\u00f4t qu'au nom de la ville, sinon "91" matcherait n'importe quel
// num\u00e9ro de rue contenant "91".
function extractPostalCode(address) {
  const match = (address || '').match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

function matchesLocationFilter(address, rawFilter) {
  const filter = rawFilter.trim();

  // 2-3 chiffres = code département (91, 75...), 5 chiffres = code postal
  // complet (75001...), utile pour cibler un arrondissement parisien.
  if (/^\d{2,5}$/.test(filter)) {
    const postal = extractPostalCode(address);
    return postal !== null && postal.startsWith(filter);
  }

  return normalize(address).includes(normalize(filter));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNearbyPlaces(lat, lng, radius, query) {
  const results = [];
  let pageToken = null;
  let page = 0;

  do {
    // Text Search accepte une requête libre ("dentiste", "plombier", "sushi"...)
    // contrairement à Nearby Search qui exige un type Google prédéfini.
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radius);
    url.searchParams.set('language', 'fr');
    url.searchParams.set('key', API_KEY);
    if (pageToken) url.searchParams.set('pagetoken', pageToken);

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API a renvoyé ${data.status}: ${data.error_message || ''}`);
    }

    results.push(...(data.results || []));
    pageToken = data.next_page_token || null;
    page += 1;

    // Google exige un court délai avant qu'un next_page_token devienne valide.
    if (pageToken) await sleep(2000);
  } while (pageToken && page < 3);

  return results;
}

// Sert la clé "navigateur" (restreinte par référent HTTP), jamais la clé
// serveur, pour charger la carte + l'autocomplete côté client.
app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: BROWSER_KEY || null });
});

const PLACE_DETAILS_FIELDS = [
  'name',
  'rating',
  'user_ratings_total',
  'formatted_address',
  'formatted_phone_number',
  'international_phone_number',
  'website',
  'opening_hours',
  'types',
  'url',
  'reviews',
].join(',');

// Étiquette lisible pour le type Google Places le plus pertinent (catégorie
// affichée sous le nom, comme "Orthoptiste" sur la fiche Google).
const TYPE_LABELS = {
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
};

function guessCategory(types) {
  const match = (types || []).find((t) => TYPE_LABELS[t]);
  if (match) return TYPE_LABELS[match];
  const first = (types || []).find((t) => t !== 'point_of_interest' && t !== 'establishment');
  return first ? first.replace(/_/g, ' ') : null;
}

// Texte de recherche enrichi pour le filtre mots-clés : la Text Search
// initiale ne renvoie ni avis ni description, il faut donc un appel Place
// Details (payant) par résultat quand un filtre mots-clés est actif.
async function fetchPlaceSearchableText(placeId) {
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'name,types,reviews');
    url.searchParams.set('language', 'fr');
    url.searchParams.set('key', API_KEY);

    const apiRes = await fetch(url);
    const data = await apiRes.json();
    if (data.status !== 'OK') return '';

    const r = data.result;
    const reviewsText = (r.reviews || []).map((rev) => rev.text || '').join(' ');
    return `${r.name || ''} ${(r.types || []).join(' ')} ${reviewsText}`;
  } catch {
    return '';
  }
}

app.get('/api/place-details', async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ error: 'Paramètre placeId manquant' });

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', PLACE_DETAILS_FIELDS);
    url.searchParams.set('language', 'fr');
    url.searchParams.set('key', API_KEY);

    const apiRes = await fetch(url);
    const data = await apiRes.json();

    if (data.status !== 'OK') {
      throw new Error(`Places API a renvoyé ${data.status}: ${data.error_message || ''}`);
    }

    const r = data.result;
    res.json({
      name: r.name,
      rating: r.rating || 0,
      reviewCount: r.user_ratings_total || 0,
      address: r.formatted_address || null,
      phone: r.formatted_phone_number || r.international_phone_number || null,
      website: r.website || null,
      category: guessCategory(r.types),
      openNow: r.opening_hours ? r.opening_hours.open_now : null,
      weekdayText: r.opening_hours ? r.opening_hours.weekday_text : null,
      mapsUrl: r.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      reviews: (r.reviews || []).slice(0, 5).map((rev) => ({
        author: rev.author_name,
        rating: rev.rating,
        relativeTime: rev.relative_time_description,
        text: rev.text,
        photoUrl: rev.profile_photo_url,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contours des départements : proxy vers un jeu de données GeoJSON public,
// nécessaire car ce fichier ne renvoie pas d'en-têtes CORS (un fetch direct
// depuis le navigateur est bloqué silencieusement).
const DEPARTMENTS_GEOJSON_URL = 'https://france-geojson.gregoiredavid.fr/repo/departements.geojson';
let departmentsGeoJsonCache = null;

async function loadDepartmentsGeoJson() {
  if (!departmentsGeoJsonCache) {
    const res = await fetch(DEPARTMENTS_GEOJSON_URL);
    if (!res.ok) throw new Error(`Contours départements indisponibles (${res.status})`);
    departmentsGeoJsonCache = await res.json();
  }
  return departmentsGeoJsonCache;
}

app.get('/api/department-boundary', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Paramètre code manquant' });

    const geojson = await loadDepartmentsGeoJson();
    const feature = geojson.features.find((f) => f.properties?.code === code);

    if (!feature) return res.status(404).json({ error: 'Département introuvable' });
    res.json(feature);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'Paramètre address manquant' });
    const location = await geocodeAddress(address);
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'Paramètres lat et lng requis' });
    const location = await reverseGeocode(lat, lng);
    res.json(location);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MAX_CITIES = 3;

app.get('/api/search', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, q, city, keywords } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Paramètres lat et lng requis' });
    }
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Paramètre q (recherche) requis' });
    }

    const cities = city
      ? city.split(',').map((c) => c.trim()).filter(Boolean).slice(0, MAX_CITIES)
      : [];

    // "in <ville>" oriente Text Search sur chaque ville séparément, puis on
    // fusionne les résultats (une requête OR n'est pas fiable côté Google).
    let raw;
    if (cities.length) {
      const perCity = await Promise.all(
        cities.map((c) => fetchNearbyPlaces(lat, lng, radius, `${q.trim()} in ${c}`))
      );
      const merged = new Map();
      perCity.flat().forEach((p) => merged.set(p.place_id, p));
      raw = [...merged.values()];
    } else {
      raw = await fetchNearbyPlaces(lat, lng, radius, q.trim());
    }

    // Filtres de sécurité : élimine les résultats hors ville/département que
    // Google renvoie parfois malgré la requête orientée, et (hors mode
    // ville/département) ceux au-delà du rayon réellement choisi.
    const radiusMeters = Number(radius);
    const places = raw
      .filter((p) => p.business_status !== 'CLOSED_PERMANENTLY')
      .filter(
        (p) =>
          !cities.length || cities.some((c) => matchesLocationFilter(p.formatted_address, c))
      )
      .filter((p) => {
        if (cities.length || !p.geometry?.location) return true;
        const { lat: pLat, lng: pLng } = p.geometry.location;
        return distanceMeters(Number(lat), Number(lng), pLat, pLng) <= radiusMeters;
      })
      .map((p) => {
        const rating = p.rating || 0;
        const reviewCount = p.user_ratings_total || 0;
        return {
          name: p.name,
          address: p.formatted_address || p.vicinity,
          rating,
          reviewCount,
          score: Math.round(bayesianScore(rating, reviewCount) * 100) / 100,
          placeId: p.place_id,
          openNow: p.opening_hours ? p.opening_hours.open_now : null,
          mapsUrl: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
          lat: p.geometry?.location?.lat ?? null,
          lng: p.geometry?.location?.lng ?? null,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Filtre mots-clés (optionnel) : cherche dans le nom, la catégorie et les
    // avis Google (5 derniers) de chaque résultat, via un appel Place Details
    // supplémentaire par restaurant — payant et plus lent, donc uniquement
    // déclenché quand l'utilisateur a explicitement renseigné des mots-clés.
    const keywordList = keywords
      ? keywords.split(',').map((k) => normalize(k.trim())).filter(Boolean)
      : [];

    let finalPlaces = places;
    if (keywordList.length) {
      const withText = await Promise.all(
        places.map(async (p) => ({
          place: p,
          haystack: normalize(`${p.name} ${await fetchPlaceSearchableText(p.placeId)}`),
        }))
      );
      finalPlaces = withText
        .filter(({ haystack }) => keywordList.some((k) => haystack.includes(k)))
        .map(({ place }) => place);
    }

    res.json({ count: finalPlaces.length, places: finalPlaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// `npm start` en local lance le serveur ; sur Netlify, ce fichier est requis
// tel quel par la fonction serverless (netlify/functions/api.js) sans jamais
// appeler listen().
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`bestRatings lancé sur http://localhost:${PORT}`);
  });
}

module.exports = app;
