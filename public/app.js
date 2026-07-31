const statusEl = document.getElementById('status');
const searchLoadingEl = document.getElementById('search-loading');
const resultsEl = document.getElementById('results');
const radiusInput = document.getElementById('radius-input');
const queryInput = document.getElementById('query-input');
const querySuggestionsEl = document.getElementById('query-suggestions');
const addressInput = document.getElementById('address-input');
const cityInput = document.getElementById('city-input');
const cityTagsContainer = document.getElementById('city-tags-input');
const filterToggleBtn = document.getElementById('filter-toggle');
const filterPanelEl = document.getElementById('filter-panel');
const shareBtn = document.getElementById('share-btn');
const sortSelect = document.getElementById('sort-select');
const reviewsMinInput = document.getElementById('reviews-min');
const reviewsMaxInput = document.getElementById('reviews-max');
const ratingMinInput = document.getElementById('rating-min');
const ratingMaxInput = document.getElementById('rating-max');
const openFilterInput = document.getElementById('open-filter');

const MAX_CITIES = 3;
const DEPARTMENT_PATTERN = /^\d{2,3}$/;
let selectedCities = [];
let lastCoords = null;
let currentPlaces = [];

// --- Carte Google Maps (panneau de droite) ---
let map = null;
let mapMarkers = [];
let searchCenter = null;
let displayedPlaces = [];
let mapsApiKey = null;

const DEFAULT_PIN_COLOR = '#ff5a3c';

// Rond simple pour les résultats (taille normale), distinct du point de
// position de l'utilisateur par sa couleur (contour blanc plus fin, pas de halo).
function buildMarkerIcon(active) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: active ? 9 : 7,
    fillColor: DEFAULT_PIN_COLOR,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
  };
}

// Met en valeur, de façon croisée, la carte de résultat et son pin sur la
// carte quand l'un des deux est survolé.
function setActiveResult(index, active) {
  const marker = mapMarkers[index];
  if (marker) {
    marker.setIcon(buildMarkerIcon(active));
    marker.setZIndex(active ? 999 : index);
  }

  const card = resultsEl.children[index];
  if (card) card.classList.toggle('is-active', active);
}

// Cercle de rayon + point de position, dessinés autour du centre connu
// (géolocalisation ou dernière recherche) et mis à jour en direct quand le
// rayon change.
let searchCircle = null;
let userMarker = null;
let userHalo = null;

function updateUserMarker(center) {
  if (userHalo) {
    userHalo.setCenter(center);
  } else {
    // Halo translucide fixe (façon "position actuelle" de Google Maps) pour
    // distinguer le point de l'utilisateur des pins de résultats, qui ont la
    // même couleur/forme.
    userHalo = new google.maps.Circle({
      map,
      center,
      radius: 35,
      strokeWeight: 0,
      fillColor: DEFAULT_PIN_COLOR,
      fillOpacity: 0.18,
      clickable: false,
      zIndex: 998,
    });
  }

  if (userMarker) {
    userMarker.setPosition(center);
    userMarker.setMap(map);
    return;
  }

  userMarker = new google.maps.Marker({
    map,
    position: center,
    title: 'Votre position',
    clickable: false,
    zIndex: 1000,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: DEFAULT_PIN_COLOR,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
  });
}

// Le rayon en km n'a pas de sens quand la recherche est ciblée par
// ville/département : on désactive le contrôle et on retire le cercle.
function updateRadiusAvailability() {
  const disabled = selectedCities.length > 0;
  radiusInput.disabled = disabled;

  if (disabled && searchCircle) {
    searchCircle.setMap(null);
  } else if (!disabled) {
    updateRadiusCircle();
  }
}

function updateRadiusCircle() {
  if (!map) return;

  const center = searchCenter || lastCoords;
  if (!center) return;

  updateUserMarker(center);

  if (selectedCities.length) return;

  const radiusMeters = Number(radiusInput.value);

  if (searchCircle) {
    searchCircle.setCenter(center);
    searchCircle.setRadius(radiusMeters);
    searchCircle.setMap(map);
  } else {
    searchCircle = new google.maps.Circle({
      map,
      center,
      radius: radiusMeters,
      strokeColor: DEFAULT_PIN_COLOR,
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: DEFAULT_PIN_COLOR,
      fillOpacity: 0.08,
      clickable: false,
      zIndex: 1,
    });
  }

  // Ne recadre sur le cercle que si aucun résultat n'est déjà affiché,
  // sinon on ne veut pas perturber la vue centrée sur les pins.
  if (!mapMarkers.length) {
    map.fitBounds(searchCircle.getBounds(), 40);
  }
}

radiusInput.addEventListener('change', updateRadiusCircle);

// Recentre et zoome la carte sur le pin d'un résultat.
function focusMarker(index) {
  const marker = mapMarkers[index];
  if (!map || !marker) return;

  map.panTo(marker.getPosition());
  map.setZoom(17);
  setActiveResult(index, true);
}

// --- Profil du lieu (façon fiche Google), affiché dans la sidebar ---

const appEl = document.querySelector('.app');
const placeDetailEl = document.getElementById('place-detail');
const controlsRowEl = document.getElementById('controls-row');

const detailNameEl = document.getElementById('detail-name');
const detailStarsEl = document.getElementById('detail-stars');
const detailRatingValueEl = document.getElementById('detail-rating-value');
const detailReviewCountEl = document.getElementById('detail-review-count');
const detailCategoryEl = document.getElementById('detail-category');
const detailActionDirections = document.getElementById('detail-action-directions');
const detailActionCall = document.getElementById('detail-action-call');
const detailActionWebsite = document.getElementById('detail-action-website');
const detailOpenLink = document.getElementById('detail-open-link');
const detailRowAddress = document.getElementById('detail-row-address');
const detailAddressEl = document.getElementById('detail-address');
const detailRowHours = document.getElementById('detail-row-hours');
const detailOpenStatusEl = document.getElementById('detail-open-status');
const detailHoursListEl = document.getElementById('detail-hours-list');
const detailRowPhone = document.getElementById('detail-row-phone');
const detailPhoneEl = document.getElementById('detail-phone');
const detailRowWebsite = document.getElementById('detail-row-website');
const detailWebsiteEl = document.getElementById('detail-website');
const detailRatingInfoBtn = document.getElementById('detail-rating-info');

const detailTabs = document.querySelectorAll('.detail-tab');
const detailTabPanels = {
  overview: document.getElementById('detail-tab-overview'),
  reviews: document.getElementById('detail-tab-reviews'),
  about: document.getElementById('detail-tab-about'),
};
const detailReviewsEmptyEl = document.getElementById('detail-reviews-empty');
const detailReviewsListEl = document.getElementById('detail-reviews-list');
const detailAboutCategoryEl = document.getElementById('detail-about-category');
const detailAboutRowAddress = document.getElementById('detail-about-row-address');
const detailAboutAddressEl = document.getElementById('detail-about-address');

function setActiveTab(tabName) {
  detailTabs.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tabName));
  Object.entries(detailTabPanels).forEach(([name, panel]) => {
    panel.hidden = name !== tabName;
  });
}

detailTabs.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

detailRatingInfoBtn.addEventListener('click', () => setActiveTab('reviews'));

const STAR_ICON_PATH = 'M10 2.3l2.24 4.54 5.01.73-3.63 3.53.86 5-4.48-2.36-4.48 2.36.86-5-3.63-3.53 5.01-.73L10 2.3Z';

function starIcon(filled) {
  const fill = filled ? 'currentColor' : 'none';
  const opacity = filled ? '' : ' opacity="0.4"';
  return `<svg viewBox="0 0 20 20" fill="${fill}" stroke="currentColor" stroke-width="1" stroke-linejoin="round"${opacity}><path d="${STAR_ICON_PATH}"/></svg>`;
}

function renderStars(rating) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return Array.from({ length: 5 }, (_, i) => starIcon(i < filled)).join('');
}

function renderReviews(reviews) {
  detailReviewsListEl.innerHTML = '';

  if (!reviews || !reviews.length) {
    detailReviewsEmptyEl.hidden = false;
    return;
  }

  detailReviewsEmptyEl.hidden = true;
  reviews.forEach((review) => {
    const li = document.createElement('li');
    li.className = 'detail-review';
    li.innerHTML = `
      <img class="detail-review-avatar" src="${review.photoUrl || ''}" alt="" />
      <div class="detail-review-body">
        <div class="detail-review-header">
          <span class="detail-review-author">${review.author || 'Anonyme'}</span>
          <span class="detail-review-time">${review.relativeTime || ''}</span>
        </div>
        <div class="detail-review-stars" aria-hidden="true">${renderStars(review.rating || 0)}</div>
        <p class="detail-review-text">${review.text || ''}</p>
      </div>
    `;
    detailReviewsListEl.appendChild(li);
  });
}

let detailRequestId = 0;

async function showPlaceDetail(index) {
  const place = displayedPlaces[index];
  if (!place) return;

  focusMarker(index);

  resultsEl.hidden = true;
  controlsRowEl.hidden = true;
  placeDetailEl.hidden = false;
  // Le profil prend alors toute la sidebar (brand, recherche, liste masqués).
  appEl.classList.add('detail-open');
  setActiveTab('overview');

  // Affichage immédiat avec ce qu'on a déjà (pas besoin d'attendre le réseau).
  renderReviews([]);
  detailNameEl.textContent = place.name;
  detailStarsEl.innerHTML = renderStars(place.rating);
  detailRatingValueEl.textContent = place.rating ? place.rating.toFixed(1) : '–';
  detailReviewCountEl.textContent = `(${place.reviewCount} avis)`;
  detailCategoryEl.textContent = '';
  detailOpenLink.href = place.mapsUrl;

  if (place.lat != null && place.lng != null) {
    detailActionDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&destination_place_id=${encodeURIComponent(place.placeId)}`;
  }

  detailRowAddress.hidden = !place.address;
  detailAddressEl.textContent = place.address || '';
  detailAboutRowAddress.hidden = !place.address;
  detailAboutAddressEl.textContent = place.address || '';
  detailAboutCategoryEl.textContent = '';

  detailActionCall.hidden = true;
  detailActionWebsite.hidden = true;
  detailRowHours.hidden = true;
  detailRowPhone.hidden = true;
  detailRowWebsite.hidden = true;

  // Complète avec les infos riches (horaires, téléphone, site, avis) une
  // fois la fiche Google Places récupérée.
  const requestId = ++detailRequestId;
  try {
    const res = await fetch(`/api/place-details?placeId=${encodeURIComponent(place.placeId)}`);
    const data = await res.json();
    if (!res.ok || requestId !== detailRequestId) return;

    if (data.mapsUrl) detailOpenLink.href = data.mapsUrl;
    if (data.category) {
      detailCategoryEl.textContent = data.category;
      detailAboutCategoryEl.textContent = data.category;
    }

    detailAboutRowAddress.hidden = !place.address;
    detailAboutAddressEl.textContent = place.address || '';

    renderReviews(data.reviews);

    if (data.phone) {
      detailPhoneEl.textContent = data.phone;
      detailPhoneEl.href = `tel:${data.phone.replace(/\s+/g, '')}`;
      detailRowPhone.hidden = false;
      detailActionCall.href = `tel:${data.phone.replace(/\s+/g, '')}`;
      detailActionCall.hidden = false;
    }

    if (data.website) {
      detailWebsiteEl.textContent = data.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
      detailWebsiteEl.href = data.website;
      detailRowWebsite.hidden = false;
      detailActionWebsite.href = data.website;
      detailActionWebsite.hidden = false;
    }

    if (data.openNow !== null || data.weekdayText) {
      detailOpenStatusEl.textContent =
        data.openNow === true ? 'Ouvert maintenant' : data.openNow === false ? 'Fermé actuellement' : '';
      detailOpenStatusEl.classList.toggle('is-closed', data.openNow === false);
      detailHoursListEl.innerHTML = '';
      (data.weekdayText || []).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        detailHoursListEl.appendChild(li);
      });
      detailRowHours.hidden = false;
    }
  } catch {
    // Les infos détaillées sont un bonus : le profil reste utilisable avec
    // les données déjà affichées (nom, note, adresse).
  }
}

function hidePlaceDetail() {
  appEl.classList.remove('detail-open');
  placeDetailEl.hidden = true;
  resultsEl.hidden = false;
  controlsRowEl.hidden = false;
}

document.getElementById('detail-back').addEventListener('click', hidePlaceDetail);

function initMap() {
  const mapEl = document.getElementById('map');
  if (!mapEl || !window.google) return;

  map = new google.maps.Map(mapEl, {
    center: { lat: 46.6034, lng: 1.8883 },
    zoom: 5,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
  });

  map.data.setStyle({
    fillColor: DEFAULT_PIN_COLOR,
    fillOpacity: 0.12,
    strokeColor: DEFAULT_PIN_COLOR,
    strokeWeight: 2,
    clickable: false,
  });

  // Si une recherche/sélection a eu lieu avant que la carte ne finisse de charger.
  if (currentPlaces.length) updateDisplay();
  selectedCities.filter((c) => DEPARTMENT_PATTERN.test(c)).forEach(addDepartmentBoundary);
}

// --- Contour des départements sélectionnés, coloré sur la carte ---
// Passe par notre propre backend (/api/department-boundary) : le fichier
// GeoJSON source n'envoie pas d'en-têtes CORS, un fetch direct depuis le
// navigateur est bloqué silencieusement.
const departmentFeatures = {};

async function addDepartmentBoundary(code) {
  if (!map || departmentFeatures[code]) return;

  try {
    const res = await fetch(`/api/department-boundary?code=${encodeURIComponent(code)}`);
    // Les DOM (971-976) ne sont pas couverts par cette source : le contour
    // est un bonus visuel, la recherche par département reste fonctionnelle.
    if (!res.ok) return;
    const feature = await res.json();

    const features = map.data.addGeoJson(feature);
    departmentFeatures[code] = features;

    const bounds = new google.maps.LatLngBounds();
    features.forEach((f) => {
      f.getGeometry().forEachLatLng((latLng) => bounds.extend(latLng));
    });
    if (!mapMarkers.length && !bounds.isEmpty()) {
      map.fitBounds(bounds, 40);
    }
  } catch {
    // Idem : bonus visuel, on ne bloque jamais la recherche pour ça.
  }
}

function removeDepartmentBoundary(code) {
  const features = departmentFeatures[code];
  if (!features || !map) return;
  features.forEach((feature) => map.data.remove(feature));
  delete departmentFeatures[code];
}

function renderMarkers(places) {
  if (!map) return;

  mapMarkers.forEach((m) => m.setMap(null));
  mapMarkers = [];

  const withCoords = places.filter((p) => p.lat != null && p.lng != null);

  if (!withCoords.length) {
    if (searchCenter) {
      map.setCenter(searchCenter);
      map.setZoom(13);
    }
    return;
  }

  const bounds = new google.maps.LatLngBounds();

  withCoords.forEach((p, index) => {
    const position = { lat: p.lat, lng: p.lng };
    const marker = new google.maps.Marker({
      map,
      position,
      title: p.name,
      icon: buildMarkerIcon(false),
      zIndex: index,
    });
    marker.addListener('click', () => showPlaceDetail(index));
    marker.addListener('mouseover', () => setActiveResult(index, true));
    marker.addListener('mouseout', () => setActiveResult(index, false));
    mapMarkers.push(marker);
    bounds.extend(position);
  });

  map.fitBounds(bounds, 60);
}

function setStatus(message, isError = false, isLoading = false) {
  statusEl.hidden = !message;
  statusEl.classList.toggle('status-error', isError);
  statusEl.classList.toggle('status-loading', isLoading);

  if (isLoading) {
    statusEl.innerHTML = `<span class="status-spinner" aria-hidden="true"></span>${message}`;
  } else {
    statusEl.textContent = message;
  }
}

// --- Gestion des tags de villes (max 3) ---

function renderCityTags() {
  cityTagsContainer.querySelectorAll('.city-tag').forEach((tag) => tag.remove());

  selectedCities.forEach((city) => {
    const tag = document.createElement('span');
    tag.className = 'city-tag';
    tag.innerHTML = `${city} <button type="button" class="city-tag-remove" aria-label="Retirer ${city}">×</button>`;
    tag.querySelector('.city-tag-remove').addEventListener('click', () => removeCity(city));
    cityTagsContainer.insertBefore(tag, cityInput);
  });

  const atLimit = selectedCities.length >= MAX_CITIES;
  cityInput.hidden = atLimit;
  cityInput.placeholder = atLimit ? '' : 'Ajouter une ville…';
}

function addCity(rawName) {
  const name = rawName.trim();
  if (!name) return;
  if (selectedCities.length >= MAX_CITIES) return;
  if (selectedCities.some((c) => c.toLowerCase() === name.toLowerCase())) {
    cityInput.value = '';
    return;
  }

  selectedCities.push(name);
  cityInput.value = '';
  renderCityTags();
  updateRadiusAvailability();
  if (DEPARTMENT_PATTERN.test(name)) addDepartmentBoundary(name);
}

function removeCity(name) {
  selectedCities = selectedCities.filter((c) => c !== name);
  renderCityTags();
  updateRadiusAvailability();
  if (DEPARTMENT_PATTERN.test(name)) removeDepartmentBoundary(name);
}

// Intercepté en phase de capture : le widget Google Autocomplete n'a aucune
// suggestion pour un code département (nombre pur) et avale sinon la touche
// Entrée avant que notre propre handler n'ait pu créer le tag.
cityInput.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Enter' && /^\d{2,3}$/.test(cityInput.value.trim())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      addCity(cityInput.value);
    }
  },
  true
);

cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCity(cityInput.value);
  } else if (e.key === 'Backspace' && !cityInput.value && selectedCities.length) {
    removeCity(selectedCities[selectedCities.length - 1]);
  }
});

const SORT_LABELS = {
  score: 'ratio (note pondérée)',
  rating: 'note',
  reviewCount: "nombre d'avis",
};

function sortPlaces(places, sortBy) {
  return [...places].sort((a, b) => b[sortBy] - a[sortBy]);
}

function intOrNull(input) {
  const value = input.value.trim();
  if (value === '') return null;
  return Math.trunc(Number(value));
}

function filterPlaces(places) {
  const reviewsMin = intOrNull(reviewsMinInput);
  const reviewsMax = intOrNull(reviewsMaxInput);
  const ratingMin = intOrNull(ratingMinInput);
  const ratingMax = intOrNull(ratingMaxInput);
  const openStatus = openFilterInput.value;

  return places.filter((p) => {
    if (reviewsMin !== null && p.reviewCount < reviewsMin) return false;
    if (reviewsMax !== null && p.reviewCount > reviewsMax) return false;
    if (ratingMin !== null && p.rating < ratingMin) return false;
    if (ratingMax !== null && p.rating > ratingMax) return false;
    if (openStatus === 'open' && p.openNow !== true) return false;
    if (openStatus === 'closed' && p.openNow !== false) return false;
    return true;
  });
}

function updateDisplay() {
  const filtered = filterPlaces(currentPlaces);
  const sorted = sortPlaces(filtered, sortSelect.value);
  displayedPlaces = sorted;

  resultsEl.innerHTML = '';
  renderMarkers(sorted);

  if (!sorted.length) {
    setStatus(
      currentPlaces.length
        ? 'Aucun résultat ne correspond à ces filtres.'
        : 'Aucun résultat trouvé dans ce rayon.'
    );
    return;
  }

  const filterSuffix = sorted.length !== currentPlaces.length ? ` (filtrés sur ${currentPlaces.length})` : '';
  setStatus(`${sorted.length} résultat(s)${filterSuffix}, triés par ${SORT_LABELS[sortSelect.value]}.`);

  sorted.forEach((p, index) => {
    // Un <button> plutôt qu'un <a> : le clic ouvre la fiche Google dans la
    // sidebar au lieu de naviguer vers une page externe.
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'dentist-card';

    card.innerHTML = `
      <div class="dentist-info">
        <div class="dentist-name">${p.name}</div>
        <div class="dentist-address">${p.address || ''}</div>
      </div>
      <div class="dentist-score">
        <div class="score-value">${p.score.toFixed(2)} / 5</div>
        <div class="score-detail">${p.rating.toFixed(1)}<span class="score-star" aria-hidden="true">${starIcon(true)}</span> · ${p.reviewCount} avis</div>
      </div>
    `;

    card.addEventListener('mouseenter', () => setActiveResult(index, true));
    card.addEventListener('mouseleave', () => setActiveResult(index, false));
    card.addEventListener('click', () => showPlaceDetail(index));

    resultsEl.appendChild(card);
  });
}

// Le filtre est replié derrière un bouton-icône ; le tri, lui, reste visible
// directement dans la barre de contrôles.
function toggleFilterPanel() {
  const wasOpen = !filterPanelEl.hidden;
  filterPanelEl.hidden = wasOpen;
  filterToggleBtn.classList.toggle('is-active', !wasOpen);
  filterToggleBtn.setAttribute('aria-expanded', String(!wasOpen));
}

filterToggleBtn.addEventListener('click', toggleFilterPanel);

function renderResults(places) {
  currentPlaces = places;
  controlsRowEl.hidden = !places.length;
  filterPanelEl.hidden = true;
  filterToggleBtn.classList.remove('is-active');
  filterToggleBtn.setAttribute('aria-expanded', 'false');
  hidePlaceDetail();
  updateDisplay();
}

// Après une recherche, on garde l'URL synchronisée avec le tri/filtres actifs
// (sans polluer l'historique de navigation, contrairement à une recherche).
function updateDisplayAndSyncUrl() {
  updateDisplay();
  syncUrl(false);
}

sortSelect.addEventListener('change', updateDisplayAndSyncUrl);
openFilterInput.addEventListener('change', updateDisplayAndSyncUrl);
[reviewsMinInput, reviewsMaxInput, ratingMinInput, ratingMaxInput].forEach((input) => {
  input.addEventListener('input', updateDisplayAndSyncUrl);
});

// --- Autocomplete du champ de recherche (liste locale, sans appel réseau) ---

const QUERY_SUGGESTIONS = [
  'Dentiste', 'Médecin généraliste', 'Pédiatre', 'Ophtalmologue', 'Opticien',
  'Kinésithérapeute', 'Ostéopathe', 'Orthophoniste', 'Orthoptiste', 'Podologue',
  'Psychologue', 'Psychiatre', 'Dermatologue', 'Gynécologue', 'Sage-femme',
  'Vétérinaire', 'Pharmacie', 'Laboratoire d\'analyses',
  'Restaurant', 'Pizzeria', 'Sushi', 'Boulangerie', 'Pâtisserie', 'Café',
  'Bar', 'Traiteur', 'Fast food', 'Kebab', 'Crêperie', 'Glacier',
  'Plombier', 'Électricien', 'Serrurier', 'Chauffagiste', 'Menuisier',
  'Peintre en bâtiment', 'Couvreur', 'Maçon', 'Vitrier', 'Déménageur',
  'Garagiste', 'Contrôle technique', 'Auto-école', 'Loueur de voitures',
  'Coiffeur', 'Barbier', 'Salon de beauté', 'Institut de beauté',
  'Manucure', 'Spa', 'Salle de sport', 'Yoga', 'Piscine',
  'Avocat', 'Notaire', 'Comptable', 'Agence immobilière', 'Assurance',
  'Banque', 'Architecte', 'Traducteur',
  'Boucherie', 'Poissonnerie', 'Fromagerie', 'Primeur', 'Supermarché',
  'Fleuriste', 'Animalerie', 'Librairie', 'Cordonnier', 'Pressing',
  'Hôtel', 'Camping', 'Photographe', 'Agence de voyage',
  'École', 'Crèche', 'Cours particuliers', 'Auto-entrepreneur',
];

function normalizeQuery(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

let querySuggestionMatches = [];
let querySuggestionActiveIndex = -1;

function renderQuerySuggestions(matches, typedValue) {
  querySuggestionMatches = matches;
  querySuggestionActiveIndex = matches.length ? 0 : -1;
  querySuggestionsEl.innerHTML = '';

  matches.forEach((match, index) => {
    const li = document.createElement('li');
    li.className = 'query-suggestion';
    if (index === querySuggestionActiveIndex) li.classList.add('is-active');
    const prefix = match.slice(0, typedValue.length);
    const rest = match.slice(typedValue.length);
    li.innerHTML = `<mark>${prefix}</mark>${rest}`;
    li.addEventListener('mousedown', (e) => {
      // mousedown (avant le blur du champ) pour que le clic soit pris en
      // compte avant que la liste ne se ferme.
      e.preventDefault();
      selectQuerySuggestion(match);
    });
    querySuggestionsEl.appendChild(li);
  });

  querySuggestionsEl.hidden = !matches.length;
}

function selectQuerySuggestion(value) {
  queryInput.value = value;
  querySuggestionsEl.hidden = true;
  querySuggestionMatches = [];
  querySuggestionActiveIndex = -1;
}

function updateQuerySuggestionHighlight() {
  [...querySuggestionsEl.children].forEach((li, index) => {
    li.classList.toggle('is-active', index === querySuggestionActiveIndex);
  });
}

queryInput.addEventListener('input', () => {
  const value = queryInput.value.trim();
  if (!value) {
    renderQuerySuggestions([], '');
    return;
  }
  const normalizedValue = normalizeQuery(value);
  const matches = QUERY_SUGGESTIONS.filter((s) => normalizeQuery(s).startsWith(normalizedValue)).slice(0, 8);
  renderQuerySuggestions(matches, value);
});

queryInput.addEventListener('keydown', (e) => {
  if (querySuggestionsEl.hidden || !querySuggestionMatches.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    querySuggestionActiveIndex = (querySuggestionActiveIndex + 1) % querySuggestionMatches.length;
    updateQuerySuggestionHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    querySuggestionActiveIndex =
      (querySuggestionActiveIndex - 1 + querySuggestionMatches.length) % querySuggestionMatches.length;
    updateQuerySuggestionHighlight();
  } else if (e.key === 'Enter' && querySuggestionActiveIndex >= 0) {
    e.preventDefault();
    selectQuerySuggestion(querySuggestionMatches[querySuggestionActiveIndex]);
  } else if (e.key === 'Escape') {
    querySuggestionsEl.hidden = true;
  }
});

queryInput.addEventListener('blur', () => {
  // Léger délai pour laisser le mousedown d'une suggestion s'exécuter avant fermeture.
  setTimeout(() => {
    querySuggestionsEl.hidden = true;
  }, 100);
});

function getQuery() {
  const query = queryInput.value.trim();
  if (!query) {
    setStatus('Indique ce que tu cherches (ex : dentiste, restaurant…).', true);
    queryInput.focus();
    return null;
  }
  return query;
}

// --- URL partageable : reflète la recherche courante pour pouvoir la
// bookmarker/partager telle quelle, et la restaurer à l'ouverture du lien.

function buildSearchParams() {
  if (!searchCenter) return null;

  const params = new URLSearchParams({
    q: queryInput.value.trim(),
    lat: searchCenter.lat,
    lng: searchCenter.lng,
    radius: radiusInput.value,
    sort: sortSelect.value,
  });

  if (selectedCities.length) params.set('city', selectedCities.join(','));
  if (addressInput.value.trim()) params.set('address', addressInput.value.trim());
  if (reviewsMinInput.value) params.set('reviewsMin', reviewsMinInput.value);
  if (reviewsMaxInput.value) params.set('reviewsMax', reviewsMaxInput.value);
  if (ratingMinInput.value) params.set('ratingMin', ratingMinInput.value);
  if (ratingMaxInput.value) params.set('ratingMax', ratingMaxInput.value);
  if (openFilterInput.value !== 'all') params.set('open', openFilterInput.value);

  return params;
}

function syncUrl(push) {
  const params = buildSearchParams();
  if (!params) return;

  const url = `${window.location.pathname}?${params}`;
  if (push) {
    window.history.pushState(null, '', url);
  } else {
    window.history.replaceState(null, '', url);
  }
}

shareBtn.addEventListener('click', async () => {
  const params = buildSearchParams();
  if (!params) return;

  const shareUrl = `${window.location.origin}${window.location.pathname}?${params}`;

  try {
    await navigator.clipboard.writeText(shareUrl);
    shareBtn.classList.add('is-active');
    const label = shareBtn.querySelector('span');
    const previous = label.textContent;
    label.textContent = 'Lien copié';
    setTimeout(() => {
      label.textContent = previous;
      shareBtn.classList.remove('is-active');
    }, 1500);
  } catch {
    setStatus("Impossible de copier le lien, copie-le depuis la barre d'adresse.", true);
  }
});

async function searchPlaces(lat, lng) {
  const query = getQuery();
  if (!query) return;

  searchCenter = { lat: Number(lat), lng: Number(lng) };
  updateRadiusCircle();

  setStatus('');
  resultsEl.hidden = true;
  searchLoadingEl.hidden = false;
  const radius = radiusInput.value;

  const params = new URLSearchParams({ lat, lng, radius, q: query });
  if (selectedCities.length) params.set('city', selectedCities.join(','));

  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erreur lors de la recherche');
    }

    renderResults(data.places);
    syncUrl(true);
  } finally {
    searchLoadingEl.hidden = true;
    resultsEl.hidden = false;
  }
}

document.getElementById('geolocate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus("La géolocalisation n'est pas supportée par ce navigateur.", true);
    return;
  }

  setStatus('Localisation en cours…', false, true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      lastCoords = { lat: latitude, lng: longitude };
      updateRadiusCircle();

      // Remplit le champ adresse avec la position détectée, pour information
      // et pour permettre à l'utilisateur de l'ajuster ensuite si besoin.
      // On n'ajoute pas la ville automatiquement : ça désactiverait la
      // recherche par rayon en km sans que l'utilisateur l'ait demandé.
      try {
        const res = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
        const data = await res.json();
        if (res.ok) {
          addressInput.value = data.formattedAddress || addressInput.value;
        }
      } catch {
        // Le remplissage de l'adresse est un bonus, on continue même en cas d'échec.
      }

      setStatus('Position détectée. Clique sur "Rechercher" pour lancer la recherche.');
    },
    (err) => {
      setStatus(`Impossible d'obtenir ta position : ${err.message}`, true);
    }
  );
});

// La recherche se lance uniquement via le bouton "Rechercher" du formulaire.
// La localisation est résolue à partir du premier champ rempli parmi :
// adresse saisie > position géolocalisée > ville sélectionnée.
document.getElementById('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getQuery()) return;

  const address = addressInput.value.trim();

  try {
    if (address) {
      setStatus('Localisation de l’adresse…', false, true);
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const geoData = await geoRes.json();

      if (!geoRes.ok) {
        throw new Error(geoData.error || 'Adresse introuvable');
      }

      await searchPlaces(geoData.lat, geoData.lng);
    } else if (lastCoords) {
      await searchPlaces(lastCoords.lat, lastCoords.lng);
    } else if (selectedCities.length) {
      setStatus(`Localisation de ${selectedCities[0]}…`, false, true);
      const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(selectedCities[0])}`);
      const geoData = await geoRes.json();

      if (!geoRes.ok) {
        throw new Error(geoData.error || 'Ville introuvable');
      }

      await searchPlaces(geoData.lat, geoData.lng);
    } else {
      setStatus('Remplis au moins un champ : adresse, position ou ville.', true);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
});

// --- Autocomplete Google Places sur les champs adresse et ville ---

// Déduit le pays de l'appareil depuis la langue du navigateur (ex: "fr-FR"
// -> "fr") pour limiter les suggestions au pays de l'utilisateur plutôt que
// de proposer des adresses du monde entier. Repli sur la France par défaut.
function getDeviceCountryCode() {
  const locale = navigator.language || (navigator.languages && navigator.languages[0]) || '';
  const region = locale.split('-')[1];
  return region ? region.toLowerCase() : 'fr';
}

async function initAutocomplete() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    mapsApiKey = data.mapsApiKey;
    if (!mapsApiKey) return;

    await loadGoogleMapsScript(mapsApiKey);
    initMap();

    const countryCode = getDeviceCountryCode();

    const addressAutocomplete = new google.maps.places.Autocomplete(addressInput, {
      types: ['geocode'],
      componentRestrictions: { country: countryCode },
    });
    addressAutocomplete.addListener('place_changed', () => {
      const place = addressAutocomplete.getPlace();
      if (place.formatted_address) addressInput.value = place.formatted_address;
    });

    const cityAutocomplete = new google.maps.places.Autocomplete(cityInput, {
      types: ['(cities)'],
      componentRestrictions: { country: countryCode },
    });
    cityAutocomplete.addListener('place_changed', () => {
      const place = cityAutocomplete.getPlace();
      if (place.name) addCity(place.name);
    });
  } catch (err) {
    console.warn("Autocomplete indisponible :", err.message);
  }

  restoreSearchFromUrl();
}

// Relance automatiquement la recherche encodée dans l'URL (lien partagé),
// une fois la carte prête pour que les pins s'affichent dès le premier rendu.
function restoreSearchFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = params.get('lat');
  const lng = params.get('lng');
  const q = params.get('q');
  if (!lat || !lng || !q) return;

  queryInput.value = q;
  if (params.get('address')) addressInput.value = params.get('address');
  if (params.get('radius')) radiusInput.value = params.get('radius');
  if (params.get('sort')) sortSelect.value = params.get('sort');
  if (params.get('reviewsMin')) reviewsMinInput.value = params.get('reviewsMin');
  if (params.get('reviewsMax')) reviewsMaxInput.value = params.get('reviewsMax');
  if (params.get('ratingMin')) ratingMinInput.value = params.get('ratingMin');
  if (params.get('ratingMax')) ratingMaxInput.value = params.get('ratingMax');
  if (params.get('open')) openFilterInput.value = params.get('open');

  const city = params.get('city');
  if (city) {
    city.split(',').forEach((c) => addCity(c));
  }

  searchPlaces(lat, lng);
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps && window.google.maps.places) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=fr`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Échec du chargement de Google Maps JS'));
    document.head.appendChild(script);
  });
}

initAutocomplete();
