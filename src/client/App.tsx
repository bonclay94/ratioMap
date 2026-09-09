import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Info,
  List,
  LoaderCircle,
  Map,
  Share2,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { DEFAULT_FILTERS } from '../shared/search';
import { locationLabel } from '../shared/locations';
import type { Filters, SearchState } from '../shared/types';
import { useSearch } from './useSearch';
import { SearchForm } from './components/SearchForm';
import { FiltersPanel } from './components/FiltersPanel';
import { Results } from './components/Results';
import { AdsConsent } from './components/AdsConsent';

const GoogleMap = lazy(() => import('./maps/GoogleMap'));
const PlaceDetail = lazy(() =>
  import('./components/PlaceDetail').then((m) => ({ default: m.PlaceDetail })),
);
const MethodDialog = lazy(() =>
  import('./components/MethodDialog').then((m) => ({ default: m.MethodDialog })),
);
const ShareDialog = lazy(() =>
  import('./components/ShareDialog').then((m) => ({ default: m.ShareDialog })),
);

export function App() {
  const search = useSearch();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [shareState, setShareState] = useState<SearchState | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const busy = search.phase !== 'idle';
  const selectedPlace = search.places.find((p) => p.placeId === selectedId);
  useEffect(() => {
    setSelectedId(null);
  }, [search.response]);
  const activeFilters = [
    search.filters.ratingMin,
    search.filters.ratingMax,
    search.filters.reviewsMin,
    search.filters.reviewsMax,
    search.filters.open === 'all' ? '' : search.filters.open,
    ...search.draft.keywords,
    search.draft.day,
  ].filter((v) => v !== '').length;
  const active = search.executed;
  return (
    <div className={`app-shell view-${mobileView}`}>
      <a className="skip-link" href="#search-query">
        Aller à la recherche
      </a>
      <header className="app-header">
        <a className="brand" href="/" aria-label="RatioMap, accueil">
          <img src="/favicon.svg" alt="" />
          <span>
            Ratio<span className="brand-accent">Map</span>
          </span>
        </a>
        <span className="header-caption">Notes, avis & géographie</span>
        <button className="header-link" type="button" onClick={() => setMethodOpen(true)}>
          Méthode de classement <ArrowUpRight size={16} />
        </button>
      </header>
      <main className="workspace">
        <aside className="sidebar" aria-label="Recherche et résultats">
          <SearchForm
            draft={search.draft}
            onChange={search.setDraft}
            onSubmit={() => search.submit()}
            onGeolocate={() => void search.geolocate()}
            locating={search.locating}
            busy={busy}
            unavailable={search.config?.searchAvailable === false}
          />
          {search.config?.searchAvailable === false && (
            <div className="service-notice" role="status">
              <TriangleAlert size={18} />
              <p>La recherche est momentanément indisponible. Réessayez plus tard.</p>
            </div>
          )}
          {search.configError && (
            <div className="service-notice" role="status">
              <Info size={18} />
              <p>La carte n’a pas pu être préparée. Vous pouvez essayer la recherche.</p>
            </div>
          )}
          {search.error && (
            <div className="error-message" role="alert">
              <TriangleAlert size={18} />
              <p>{search.error}</p>
            </div>
          )}
          {search.notice && (
            <p className="notice" role="status">
              {search.notice}
            </p>
          )}
          <section className="results-section" aria-label="Résultats de recherche" aria-busy={busy}>
            <div className="results-heading">
              <div>
                <p className="eyebrow">Résultats</p>
                <h2>
                  {active
                    ? `${search.places.length} lieu${search.places.length > 1 ? 'x' : ''}`
                    : 'Aucune recherche en cours'}
                </h2>
              </div>
              {active && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Partager cette recherche"
                  onClick={() => setShareState(active)}
                >
                  <Share2 size={19} />
                </button>
              )}
            </div>
            {active && (
              <p className="search-context">
                {active.draft.q} ·{' '}
                {active.draft.cities.length
                  ? active.draft.cities.map(locationLabel).join(', ')
                  : `${active.draft.radius / 1000} km · ${active.draft.address || 'Position choisie'}`}
              </p>
            )}
            {search.dirty && !busy && (
              <p className="draft-notice">
                Critères modifiés. Lancez une recherche pour les appliquer.
              </p>
            )}
            <div className="result-controls">
              <label htmlFor="sort-select">
                <span className="sr-only">Trier les résultats</span>
                <select
                  id="sort-select"
                  value={search.filters.sort}
                  disabled={busy}
                  onChange={(e) =>
                    search.changeFilters({
                      ...search.filters,
                      sort: e.target.value as Filters['sort'],
                    })
                  }
                >
                  <option value="score">Meilleur ratio</option>
                  <option value="rating">Meilleure note</option>
                  <option value="reviewCount">Plus d’avis</option>
                  <option value="distance">Plus proches</option>
                </select>
              </label>
              <button
                className={`secondary-button ${filtersOpen ? 'is-active' : ''}`}
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls="filters-panel"
              >
                <SlidersHorizontal size={15} /> Filtres
                {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
              </button>
            </div>
            {filtersOpen && (
              <FiltersPanel
                filters={search.filters}
                draft={search.draft}
                onFilters={search.changeFilters}
                onDraft={search.setDraft}
                onSubmit={() => search.submit()}
                error={search.filterError}
                busy={busy}
              />
            )}
            {busy && (
              <p className="loading-message" role="status">
                <LoaderCircle size={18} className="spin" />
                {search.phase === 'locating'
                  ? 'Recherche de votre adresse…'
                  : 'Recherche des lieux…'}
                {active && <span>Résultats précédents ci-dessous.</span>}
              </p>
            )}
            {search.response.warnings?.map((warning, i) => (
              <p key={i} className="warning-message" role="status">
                {warning}
              </p>
            ))}
            <Results
              places={search.places}
              searched={Boolean(active)}
              busy={busy}
              hasUnfiltered={search.response.places.length > 0}
              selectedId={selectedId || hoverId}
              onSelect={setSelectedId}
              onHover={setHoverId}
              onReset={() => search.changeFilters({ ...DEFAULT_FILTERS })}
            />
            {active && (
              <div className="results-attribution">
                <p>Données Google Maps · sélection non exhaustive</p>
                <button type="button" className="text-button" onClick={() => setMethodOpen(true)}>
                  <Info size={14} /> Comment les lieux sont-ils classés ?
                </button>
                {search.response.attributions?.map((credit, i) => (
                  <p key={i}>{credit}</p>
                ))}
              </div>
            )}
          </section>
          <div id="ad-slot" className="ad-slot" hidden aria-label="Publicité" />
          <footer className="app-footer">
            <a href="/legal.html">Mentions légales</a>
            <a href="/privacy.html">Confidentialité</a>
            <span>RatioMap · v2</span>
            <AdsConsent config={search.config} />
          </footer>
        </aside>
        <section className="map-pane" aria-label="Carte des lieux">
          <Suspense
            fallback={
              <div className="map-empty">
                <LoaderCircle className="spin" />
                <p>Préparation de la carte…</p>
              </div>
            }
          >
            <GoogleMap
              config={search.config}
              places={search.places}
              search={search.executed}
              activeId={selectedId || hoverId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onHover={setHoverId}
              visible={mobileView === 'map'}
              onAddress={(address) => search.setDraft((d) => ({ ...d, address }))}
              onMethod={() => setMethodOpen(true)}
            />
          </Suspense>
        </section>
      </main>
      <nav className="mobile-view-switch" aria-label="Affichage des lieux">
        <button
          type="button"
          aria-pressed={mobileView === 'list'}
          onClick={() => setMobileView('list')}
        >
          <List size={18} /> Liste
        </button>
        <button
          type="button"
          aria-pressed={mobileView === 'map'}
          onClick={() => setMobileView('map')}
        >
          <Map size={18} /> Carte
        </button>
      </nav>
      <Suspense
        fallback={
          <p className="dialog-loading" role="status">
            Ouverture…
          </p>
        }
      >
        {selectedPlace && (
          <PlaceDetail
            key={selectedPlace.placeId}
            place={selectedPlace}
            onClose={() => setSelectedId(null)}
          />
        )}{' '}
        {methodOpen && <MethodDialog onClose={() => setMethodOpen(false)} />}{' '}
        {shareState && <ShareDialog state={shareState} onClose={() => setShareState(null)} />}
      </Suspense>
    </div>
  );
}
