import { useEffect, useRef, useState } from 'react';
import { Compass, Expand, LoaderCircle } from 'lucide-react';
import type { Place, PublicConfig, SearchState } from '../../shared/types';
import { isDepartment } from '../../shared/locations';
import { requestJson } from '../api';
import { loadGoogleMaps } from './loader';

interface Props {
  config: PublicConfig | null;
  places: Place[];
  search: SearchState | null;
  activeId: string | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  visible: boolean;
  onAddress: (address: string) => void;
  onMethod: () => void;
}
type MarkerEntry = {
  marker: google.maps.Marker | google.maps.marker.AdvancedMarkerElement;
  remove: () => void;
  highlight: (active: boolean) => void;
};
export default function GoogleMap({
  config,
  places,
  search,
  activeId,
  selectedId,
  onSelect,
  onHover,
  visible,
  onAddress,
  onMethod,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, MarkerEntry>());
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);
  const fittedSearch = useRef('');
  const callbacks = useRef({ onSelect, onHover, onAddress });
  callbacks.current = { onSelect, onHover, onAddress };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [boundaryNotice, setBoundaryNotice] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!config?.mapsApiKey) return;
    let cancelled = false;
    let autocomplete: google.maps.places.Autocomplete | null = null;
    const authError = () =>
      setError('La carte est indisponible. Vous pouvez consulter les résultats dans la liste.');
    window.addEventListener('ratiomap:map-error', authError);
    setError('');
    loadGoogleMaps(config.mapsApiKey)
      .then(() => {
        if (cancelled || !element.current) return;
        const map = new google.maps.Map(element.current, {
          center: { lat: 46.6, lng: 2.4 },
          zoom: 6,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          ...(config.mapsMapId
            ? { mapId: config.mapsMapId }
            : {
                styles: [
                  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                ],
              }),
        });
        mapRef.current = map;
        fittedSearch.current = '';
        setReady(true);
        // The plain text field works independently when the Google widget is unavailable.
        const input = document.getElementById('search-address') as HTMLInputElement | null;
        if (input && google.maps.places?.Autocomplete) {
          autocomplete = new google.maps.places.Autocomplete(input, {
            types: ['geocode'],
            fields: ['formatted_address'],
            componentRestrictions: { country: 'fr' },
          });
          autocomplete.addListener('place_changed', () => {
            const address = autocomplete?.getPlace().formatted_address;
            if (address) callbacks.current.onAddress(address);
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      window.removeEventListener('ratiomap:map-error', authError);
      if (autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
        autocomplete.unbindAll();
      }
      markers.current.forEach((m) => m.remove());
      markers.current.clear();
      mapRef.current = null;
      setReady(false);
    };
  }, [config?.mapsApiKey, config?.mapsMapId, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const visibleIds = new Set(
      places.filter((p) => p.lat !== null && p.lng !== null).map((p) => p.placeId),
    );
    for (const [id, entry] of markers.current)
      if (!visibleIds.has(id)) {
        entry.remove();
        markers.current.delete(id);
      }
    const bounds = new google.maps.LatLngBounds();
    places.forEach((p, i) => {
      if (p.lat === null || p.lng === null) return;
      const position = { lat: p.lat, lng: p.lng };
      bounds.extend(position);
      const existing = markers.current.get(p.placeId);
      if (existing) {
        if (existing.marker instanceof google.maps.Marker)
          existing.marker.setLabel({
            text: String(i + 1),
            color: '#fff',
            fontSize: '12px',
            fontWeight: '700',
          });
        else {
          const content = existing.marker.content;
          if (content instanceof HTMLElement) content.textContent = String(i + 1);
        }
        return;
      }
      if (config?.mapsMapId && google.maps.marker?.AdvancedMarkerElement) {
        const content = document.createElement('button');
        content.type = 'button';
        content.className = 'map-number';
        content.textContent = String(i + 1);
        content.setAttribute('aria-label', p.name);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position,
          content,
          title: p.name,
        });
        content.addEventListener('click', () => callbacks.current.onSelect(p.placeId));
        content.addEventListener('mouseenter', () => callbacks.current.onHover(p.placeId));
        content.addEventListener('mouseleave', () => callbacks.current.onHover(null));
        content.addEventListener('focus', () => callbacks.current.onHover(p.placeId));
        content.addEventListener('blur', () => callbacks.current.onHover(null));
        markers.current.set(p.placeId, {
          marker,
          remove: () => {
            marker.map = null;
          },
          highlight: (active) => {
            content.classList.toggle('is-active', active);
            marker.zIndex = active ? 1000 : 1;
          },
        });
      } else {
        const icon = (active: boolean): google.maps.Symbol => ({
          path: google.maps.SymbolPath.CIRCLE,
          scale: active ? 18 : 15,
          fillColor: active ? '#202a34' : '#c93d20',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        });
        const marker = new google.maps.Marker({
          map,
          position,
          title: p.name,
          icon: icon(false),
          label: { text: String(i + 1), color: '#fff', fontSize: '12px', fontWeight: '700' },
        });
        marker.addListener('click', () => callbacks.current.onSelect(p.placeId));
        marker.addListener('mouseover', () => callbacks.current.onHover(p.placeId));
        marker.addListener('mouseout', () => callbacks.current.onHover(null));
        markers.current.set(p.placeId, {
          marker,
          remove: () => {
            google.maps.event.clearInstanceListeners(marker);
            marker.setMap(null);
          },
          highlight: (active) => {
            marker.setIcon(icon(active));
            marker.setZIndex(active ? 1000 : 1);
          },
        });
      }
    });
    if (search?.center) bounds.extend(search.center);
    if (!bounds.isEmpty()) {
      boundsRef.current = bounds;
      const key = JSON.stringify(search ? [search.center, search.draft] : []);
      if (fittedSearch.current !== key) {
        fittedSearch.current = key;
        map.fitBounds(bounds, 70);
        if (places.length <= 1)
          google.maps.event.addListenerOnce(map, 'idle', () => {
            if ((map.getZoom() || 0) > 16) map.setZoom(16);
          });
      }
    }
  }, [places, ready, config?.mapsMapId, search?.center]);

  useEffect(() => {
    markers.current.forEach((entry, id) => entry.highlight(id === activeId));
  }, [activeId, places, ready]);
  useEffect(() => {
    const selected = places.find((p) => p.placeId === selectedId);
    if (!ready || !selected || selected.lat === null || selected.lng === null) return;
    mapRef.current?.panTo({ lat: selected.lat, lng: selected.lng });
    mapRef.current?.setZoom(16);
  }, [selectedId, places, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !search?.center) return;
    const point = new google.maps.Circle({
      map,
      center: search.center,
      radius: 30,
      fillColor: '#1769b1',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2,
      clickable: false,
      zIndex: 2,
    });
    const circle = search.draft.cities.length
      ? null
      : new google.maps.Circle({
          map,
          center: search.center,
          radius: search.draft.radius,
          strokeColor: '#c93d20',
          strokeOpacity: 0.6,
          strokeWeight: 1.5,
          fillColor: '#c93d20',
          fillOpacity: 0.045,
          clickable: false,
        });
    if (!places.length && circle) {
      const bounds = circle.getBounds();
      if (bounds) {
        map.fitBounds(bounds, 40);
        boundsRef.current = bounds;
      }
    }
    return () => {
      point.setMap(null);
      circle?.setMap(null);
    };
  }, [ready, search, places.length]);

  const departmentCodes = search?.draft.cities.filter(isDepartment).join(',') || '';
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const abort = new AbortController();
    setBoundaryNotice('');
    map.data.forEach((f) => map.data.remove(f));
    map.data.setStyle({
      fillColor: '#c93d20',
      fillOpacity: 0.05,
      strokeColor: '#c93d20',
      strokeWeight: 1.5,
      clickable: false,
    });
    for (const code of departmentCodes.split(',').filter(Boolean))
      void requestJson<object>(`/api/department-boundary?code=${encodeURIComponent(code)}`, {
        signal: abort.signal,
      })
        .then((feature) => {
          if (!abort.signal.aborted) map.data.addGeoJson(feature);
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setBoundaryNotice(
              'Certains contours ne sont pas disponibles. La recherche reste valable.',
            );
        });
    return () => {
      abort.abort();
      map.data.forEach((f) => map.data.remove(f));
    };
  }, [ready, departmentCodes]);

  useEffect(() => {
    if (visible && ready && mapRef.current) {
      google.maps.event.trigger(mapRef.current, 'resize');
      if (boundsRef.current) mapRef.current.fitBounds(boundsRef.current, 60);
    }
  }, [visible, ready]);
  const unavailable = !config?.mapsApiKey || Boolean(error);
  return (
    <>
      <div
        ref={element}
        className="google-map"
        aria-label="Carte Google Maps"
        hidden={!ready || Boolean(error)}
      />
      {(!ready || error) && (
        <div className="map-empty">
          <span className="map-compass">
            <Compass size={36} />
          </span>
          <h2>
            {search
              ? 'Vos bonnes adresses restent dans la liste.'
              : 'Votre quartier a de bonnes adresses.'}
          </h2>
          <p>
            {error ||
              (config && !config.mapsApiKey
                ? 'La carte est indisponible pour le moment. La recherche reste accessible.'
                : 'La carte se prépare…')}
          </p>
          {!unavailable && <LoaderCircle size={22} className="spin" />}
          {error && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Réessayer la carte
            </button>
          )}
        </div>
      )}
      <div className="map-caption">
        <span className="legend-dot" />
        {search
          ? `${places.length} lieu${places.length > 1 ? 'x' : ''} · ${search.draft.cities.length ? 'zones sélectionnées' : `rayon de ${search.draft.radius / 1000} km`}`
          : 'Des lieux classés avec du recul.'}
      </div>
      {ready && !error && (
        <button
          className="map-fit icon-button"
          type="button"
          aria-label="Voir tous les résultats sur la carte"
          onClick={() => {
            if (boundsRef.current) mapRef.current?.fitBounds(boundsRef.current, 70);
          }}
        >
          <Expand size={20} />
        </button>
      )}
      {boundaryNotice && <p className="boundary-notice">{boundaryNotice}</p>}
      {!search && (
        <div className="method-card">
          <span className="eyebrow">LE RATIO, EN CLAIR</span>
          <p>
            5 étoiles et 2 avis ?<br />
            <strong>Ça ne raconte pas toute l’histoire.</strong>
          </p>
          <span>
            Le score pondère la note par le nombre d’avis. Une base plus solide pour faire votre
            choix.
          </span>
          <button type="button" className="text-button" onClick={onMethod}>
            Comprendre le calcul ↗
          </button>
        </div>
      )}
    </>
  );
}
