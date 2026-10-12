import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSearchParams,
  DEFAULT_DRAFT,
  DEFAULT_FILTERS,
  filterAndSort,
  parseSearchParams,
  validateFilters,
} from '../shared/search';
import { locationQuery } from '../shared/locations';
import type {
  Coordinates,
  Filters,
  PublicConfig,
  SearchDraft,
  SearchResponse,
  SearchState,
} from '../shared/types';
import { requestJson } from './api';

const emptyResponse: SearchResponse = { count: 0, places: [], warnings: [], attributions: [] };
type Phase = 'idle' | 'locating' | 'searching';
export function useSearch() {
  const [draft, setDraft] = useState<SearchDraft>({ ...DEFAULT_DRAFT });
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [executed, setExecuted] = useState<SearchState | null>(null);
  const [response, setResponse] = useState(emptyResponse);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [position, setPosition] = useState<{ coords: Coordinates; address: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const geoGeneration = useRef(0);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  const execute = useCallback(async (snapshot: SearchState, history: 'push' | 'none') => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError('');
    setNotice('');
    try {
      let center = snapshot.center;
      if (!center) {
        const address =
          snapshot.draft.address.trim() ||
          (snapshot.draft.cities[0] ? locationQuery(snapshot.draft.cities[0]) : '');
        if (!address)
          throw new Error('Indiquez une adresse, choisissez une zone ou utilisez votre position.');
        setPhase('locating');
        const geo = await requestJson<Coordinates>(
          `/api/geocode?${new URLSearchParams({ address })}`,
          { signal: current.signal },
        );
        center = { lat: geo.lat, lng: geo.lng };
      }
      current.signal.throwIfAborted();
      setPhase('searching');
      const state = { ...snapshot, center };
      const result = await requestJson<SearchResponse>(`/api/search?${buildSearchParams(state)}`, {
        signal: current.signal,
      });
      if (controller.current !== current || current.signal.aborted) return;
      setExecuted(state);
      setResponse(result);
      if (history === 'push') window.history.pushState(null, '', `/?${buildSearchParams(state)}`);
    } catch (error) {
      if (!current.signal.aborted && controller.current === current)
        setError(error instanceof Error ? error.message : 'La recherche n’a pas abouti.');
    } finally {
      if (controller.current === current) setPhase('idle');
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    requestJson<PublicConfig>('/api/config', { signal: abort.signal })
      .then(setConfig)
      .catch(() => {
        if (!abort.signal.aborted) setConfigError(true);
      });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const state = parseSearchParams(params);
      geoGeneration.current++;
      setLocating(false);
      setPosition(null);
      if (state) {
        setDraft(state.draft);
        setFilters(state.filters);
        void execute(state, 'none');
      } else {
        controller.current?.abort();
        controller.current = null;
        setPhase('idle');
        setExecuted(null);
        setResponse(emptyResponse);
        setDraft({ ...DEFAULT_DRAFT });
        setFilters({ ...DEFAULT_FILTERS });
        setError(
          params.has('q') || params.has('lat')
            ? 'Ce lien de recherche est incomplet ou invalide. Vous pouvez lancer une nouvelle recherche.'
            : '',
        );
        setNotice(
          params.get('share') === 'missing'
            ? 'Ce lien partagé est introuvable ou a expiré. Lancez une nouvelle recherche.'
            : '',
        );
      }
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => {
      controller.current?.abort();
      geoGeneration.current++;
      window.removeEventListener('popstate', restore);
    };
  }, [execute]);

  function submit(nextDraft = draft) {
    if (!nextDraft.q.trim()) {
      setError('Indiquez ce que vous cherchez.');
      return;
    }
    if ((nextDraft.day === '') !== (nextDraft.time === '')) {
      setError('Choisissez le jour et l’heure ensemble, ou effacez les deux.');
      return;
    }
    const filterError = validateFilters(filters);
    if (filterError) {
      setError(filterError);
      return;
    }
    let center: Coordinates | null = null;
    if (position && (nextDraft.address === position.address || !nextDraft.address))
      center = position.coords;
    else if (executed?.draft.address === nextDraft.address && nextDraft.address)
      center = executed.center;
    void execute({ draft: { ...nextDraft, q: nextDraft.q.trim() }, filters, center }, 'push');
  }
  function changeFilters(next: Filters) {
    setFilters(next);
    if (executed && !validateFilters(next)) {
      const state = { ...executed, filters: next };
      setExecuted(state);
      window.history.replaceState(null, '', `/?${buildSearchParams(state)}`);
    }
  }
  /** Fills the form from the assistant. Nothing is searched until the user submits. */
  function applyCriteria(nextDraft: SearchDraft, nextFilters: Filters) {
    setDraft(nextDraft);
    setFilters(nextFilters);
    setError('');
    setNotice('');
  }
  async function geolocate() {
    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas disponible. Saisissez une adresse.');
      return;
    }
    const generation = ++geoGeneration.current;
    const originalAddress = latestDraft.current.address;
    setLocating(true);
    setError('');
    setNotice('');
    try {
      const found = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          maximumAge: 60000,
          enableHighAccuracy: false,
        }),
      );
      const coords = { lat: found.coords.latitude, lng: found.coords.longitude };
      let address = 'Ma position';
      try {
        address = (
          await requestJson<{ formattedAddress: string }>(
            `/api/reverse-geocode?${new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) })}`,
          )
        ).formattedAddress;
      } catch {
        /* Coordinates remain usable. */
      }
      if (generation !== geoGeneration.current || latestDraft.current.address !== originalAddress)
        return;
      setPosition({ coords, address });
      setDraft((d) => ({ ...d, address }));
      setNotice('Position trouvée. Vous pouvez lancer la recherche.');
    } catch {
      if (generation === geoGeneration.current)
        setError('Position indisponible. Autorisez la localisation ou saisissez une adresse.');
    } finally {
      if (generation === geoGeneration.current) setLocating(false);
    }
  }
  const filterError = validateFilters(filters);
  const places = useMemo(
    () => filterAndSort(response.places, filterError ? DEFAULT_FILTERS : filters),
    [response.places, filters, filterError],
  );
  const dirty = executed !== null && JSON.stringify(draft) !== JSON.stringify(executed.draft);
  return {
    draft,
    setDraft,
    filters,
    changeFilters,
    applyCriteria,
    executed,
    response,
    places,
    phase,
    error,
    setError,
    config,
    configError,
    submit,
    geolocate,
    locating,
    notice,
    setNotice,
    filterError,
    dirty,
  };
}
