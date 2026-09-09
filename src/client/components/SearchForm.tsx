import { useState, type FormEvent } from 'react';
import { ChevronDown, LocateFixed, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { QUERY_SUGGESTIONS, normalize } from '../../shared/locations';
import { RADII } from '../../shared/search';
import type { SearchDraft } from '../../shared/types';
import { Combobox } from './Combobox';
import { TagInput } from './TagInput';

interface Props {
  draft: SearchDraft;
  onChange: (draft: SearchDraft) => void;
  onSubmit: () => void;
  onGeolocate: () => void;
  locating: boolean;
  busy: boolean;
  unavailable: boolean;
}
export function SearchForm({
  draft,
  onChange,
  onSubmit,
  onGeolocate,
  locating,
  busy,
  unavailable,
}: Props) {
  const [zoneOpen, setZoneOpen] = useState(false);
  const change = <K extends keyof SearchDraft>(key: K, value: SearchDraft[K]) =>
    onChange({ ...draft, [key]: value });
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  const showZones = zoneOpen || draft.cities.length > 0;
  return (
    <section className="search-section">
      <h1>Comparer les lieux.</h1>
      <p className="intro">Une note, un nombre d’avis, une zone.</p>
      <form className="search-form" onSubmit={submit} aria-label="Rechercher des lieux">
        <label htmlFor="search-query">Que cherchez-vous ?</label>
        <Combobox
          id="search-query"
          value={draft.q}
          onChange={(v) => change('q', v)}
          required
          maxLength={120}
          placeholder="Restaurant, dentiste, coiffeur…"
          leading={<Search size={18} />}
          suggestions={
            draft.q
              ? QUERY_SUGGESTIONS.filter((s) => normalize(s).startsWith(normalize(draft.q)))
                  .slice(0, 7)
                  .map((s) => ({ value: s, label: s }))
              : []
          }
        />
        <label htmlFor="search-address">Autour de</label>
        <div className="input-wrap">
          <MapPin size={18} />
          <input
            id="search-address"
            maxLength={300}
            value={draft.address}
            onChange={(e) => change('address', e.target.value)}
            placeholder="Adresse, ville ou code postal"
            autoComplete="off"
          />
          <button
            className="icon-button"
            type="button"
            disabled={locating}
            onClick={onGeolocate}
            aria-label="Utiliser ma position"
          >
            <LocateFixed size={19} className={locating ? 'spin' : ''} />
          </button>
        </div>
        <div className="search-options">
          <label htmlFor="search-radius">
            Rayon{' '}
            <select
              id="search-radius"
              value={draft.radius}
              disabled={draft.cities.length > 0}
              onChange={(e) => change('radius', Number(e.target.value))}
            >
              {[...new Set([...RADII, draft.radius])]
                .sort((a, b) => a - b)
                .map((r) => (
                  <option key={r} value={r}>
                    {r / 1000} km
                  </option>
                ))}
            </select>
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() => setZoneOpen((v) => !v)}
            aria-expanded={showZones}
            aria-controls="zone-fields"
          >
            <SlidersHorizontal size={16} /> Préciser la zone <ChevronDown size={14} />
          </button>
        </div>
        {showZones && (
          <div className="zone-fields" id="zone-fields">
            <TagInput
              location
              values={draft.cities}
              onChange={(v) => change('cities', v)}
              max={3}
              label="Villes ou départements"
            />
            <p className="field-hint">
              {draft.cities.length
                ? 'La recherche couvre ces zones ; le rayon ne s’applique pas.'
                : 'Limitez la recherche à trois villes, départements ou arrondissements.'}
            </p>
          </div>
        )}
        <button className="primary-button" type="submit" disabled={unavailable}>
          <Search size={18} />
          {busy ? 'Relancer la recherche' : 'Rechercher'}
        </button>
      </form>
      <div className="quick-searches" aria-label="Idées de recherche">
        <span>Essayer :</span>
        {['Restaurant', 'Café', 'Dentiste', 'Coiffeur'].map((label) => (
          <button
            type="button"
            key={label}
            onClick={() => change('q', label)}
            aria-pressed={draft.q === label}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
