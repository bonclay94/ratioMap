require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error('GOOGLE_MAPS_API_KEY manquante. Copie .env.example vers .env et renseigne ta clé.');
  // En local uniquement : sur Netlify, une fonction ne doit pas tuer le process.
  if (require.main === module) process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));

// Constante de confiance et note moyenne a priori pour le score bayésien.
// Rien n'est exclu : un lieu sans avis retombe simplement sur cette moyenne.
const PRIOR_COUNT = 10;
const PRIOR_MEAN = 3.9;

function bayesianScore(rating, reviewCount) {
  return (reviewCount * rating + PRIOR_COUNT * PRIOR_MEAN) / (reviewCount + PRIOR_COUNT);
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

  if (/^\d{2,3}$/.test(filter)) {
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

// Clé exposée au navigateur pour charger l'autocomplete d'adresses (Maps JavaScript API).
// À restreindre par référent HTTP dans Google Cloud Console.
app.get('/api/config', (req, res) => {
  res.json({ mapsApiKey: API_KEY });
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
    const { lat, lng, radius = 5000, q, city } = req.query;
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

    // Filtre de sécurité : élimine les résultats hors ville/département que
    // Google renvoie parfois malgré la requête orientée.
    const places = raw
      .filter((p) => p.business_status !== 'CLOSED_PERMANENTLY')
      .filter(
        (p) =>
          !cities.length || cities.some((c) => matchesLocationFilter(p.formatted_address, c))
      )
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

    res.json({ count: places.length, places });
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
