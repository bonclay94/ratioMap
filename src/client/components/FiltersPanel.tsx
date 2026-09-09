import { RotateCcw } from 'lucide-react';
import { DEFAULT_FILTERS } from '../../shared/search';
import type { Filters, SearchDraft } from '../../shared/types';
import { TagInput } from './TagInput';

interface Props {
  filters: Filters;
  draft: SearchDraft;
  onFilters: (filters: Filters) => void;
  onDraft: (draft: SearchDraft) => void;
  onSubmit: () => void;
  error: string | null;
  busy: boolean;
}
export function FiltersPanel({ filters, draft, onFilters, onDraft, onSubmit, error, busy }: Props) {
  return (
    <fieldset className="filters-panel" id="filters-panel" disabled={busy}>
      <legend className="sr-only">Affiner les résultats</legend>
      <div className="section-heading">
        <h3>Affiner les résultats</h3>
        <button
          className="text-button"
          type="button"
          onClick={() => onFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
        >
          <RotateCcw size={14} /> Réinitialiser
        </button>
      </div>
      <div className="filter-grid">
        <label htmlFor="rating-min">
          Note minimum
          <input
            id="rating-min"
            type="number"
            min="0"
            max="5"
            step="0.1"
            placeholder="0"
            value={filters.ratingMin}
            onChange={(e) => onFilters({ ...filters, ratingMin: e.target.value })}
          />
        </label>
        <label htmlFor="rating-max">
          Note maximum
          <input
            id="rating-max"
            type="number"
            min="0"
            max="5"
            step="0.1"
            placeholder="5"
            value={filters.ratingMax}
            onChange={(e) => onFilters({ ...filters, ratingMax: e.target.value })}
          />
        </label>
        <label htmlFor="reviews-min">
          Avis minimum
          <input
            id="reviews-min"
            type="number"
            min="0"
            max="100000000"
            step="1"
            placeholder="0"
            value={filters.reviewsMin}
            onChange={(e) => onFilters({ ...filters, reviewsMin: e.target.value })}
          />
        </label>
        <label htmlFor="reviews-max">
          Avis maximum
          <input
            id="reviews-max"
            type="number"
            min="0"
            max="100000000"
            step="1"
            placeholder="Sans limite"
            value={filters.reviewsMax}
            onChange={(e) => onFilters({ ...filters, reviewsMax: e.target.value })}
          />
        </label>
      </div>
      <label className="filter-label" htmlFor="open-filter">
        Ouverture actuelle
        <select
          id="open-filter"
          value={filters.open}
          onChange={(e) => onFilters({ ...filters, open: e.target.value as Filters['open'] })}
        >
          <option value="all">Tous les lieux</option>
          <option value="open">Ouverts maintenant</option>
          <option value="closed">Fermés actuellement</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="advanced-filters">
        <h3>Aller un peu plus loin</h3>
        <p className="field-hint">Ces critères s’appliquent lors d’une nouvelle recherche.</p>
        <div className="filter-grid">
          <label htmlFor="day-filter">
            Ouvert le
            <select
              id="day-filter"
              value={draft.day}
              onChange={(e) => onDraft({ ...draft, day: e.target.value })}
            >
              <option value="">Tous les jours</option>
              {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map(
                (d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ),
              )}
            </select>
          </label>
          <label htmlFor="time-filter">
            À cette heure
            <input
              id="time-filter"
              type="time"
              value={draft.time}
              onChange={(e) => onDraft({ ...draft, time: e.target.value })}
            />
          </label>
        </div>
        <p className="field-hint">Horaires habituels du lieu, hors jours exceptionnels.</p>
        <TagInput
          values={draft.keywords}
          onChange={(keywords) => onDraft({ ...draft, keywords })}
          max={5}
          label="Un de ces mots-clés"
        />
        <p className="field-hint">
          Dans le nom, la catégorie ou les quelques avis fournis par Google.
        </p>
        <div className="advanced-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onDraft({ ...draft, day: '', time: '', keywords: [] })}
          >
            Effacer ces critères
          </button>
          <button className="primary-button" type="button" onClick={onSubmit}>
            Appliquer
          </button>
        </div>
      </div>
    </fieldset>
  );
}
