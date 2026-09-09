import { ChevronRight, MapPin, SearchX, Star } from 'lucide-react';
import type { Place } from '../../shared/types';

const number = new Intl.NumberFormat('fr-FR');
export function formatDistance(distance: number | null): string {
  if (distance === null) return '';
  return distance < 1000
    ? `${number.format(distance)} m`
    : `${number.format(Math.round(distance / 100) / 10)} km`;
}
export function OpenStatus({ value }: { value: boolean | null }) {
  return (
    <span
      className={`open-status ${value === true ? 'is-open' : value === false ? 'is-closed' : ''}`}
    >
      {value === true ? 'Ouvert' : value === false ? 'Fermé' : 'Horaires inconnus'}
    </span>
  );
}
export function Results({
  places,
  searched,
  busy,
  hasUnfiltered,
  selectedId,
  onSelect,
  onHover,
  onReset,
}: {
  places: Place[];
  searched: boolean;
  busy: boolean;
  hasUnfiltered: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onReset: () => void;
}) {
  if (!searched && !busy)
    return (
      <div className="empty-state">
        <h3>Définissez votre recherche.</h3>
        <p>
          Indiquez une activité et une adresse. Les lieux seront classés selon leur note pondérée
          par le nombre d’avis.
        </p>
      </div>
    );
  if (busy && !searched)
    return (
      <div className="skeleton-list" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-card">
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    );
  if (!places.length)
    return (
      <div className="empty-state">
        <span className="empty-symbol">
          <SearchX size={28} />
        </span>
        <h3>Aucun lieu ne correspond.</h3>
        <p>
          {hasUnfiltered
            ? 'Essayez des filtres moins restrictifs pour retrouver des résultats.'
            : 'Essayez une autre recherche ou élargissez la zone.'}
        </p>
        {hasUnfiltered && (
          <button className="secondary-button" type="button" onClick={onReset}>
            Effacer les filtres
          </button>
        )}
      </div>
    );
  return (
    <ol className="results-list" aria-label="Lieux classés" aria-busy={busy}>
      {places.map((p, index) => (
        <li key={p.placeId}>
          <button
            type="button"
            id={`place-${p.placeId}`}
            className={`place-card ${selectedId === p.placeId ? 'is-active' : ''}`}
            onClick={() => onSelect(p.placeId)}
            onMouseEnter={() => onHover(p.placeId)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(p.placeId)}
            onBlur={() => onHover(null)}
          >
            <div className="place-topline">
              <span className="place-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="place-category">{p.category || 'Lieu'}</span>
              <OpenStatus value={p.openNow} />
            </div>
            <div className="place-title-row">
              <h3>{p.name}</h3>
              <ChevronRight size={17} />
            </div>
            <p className="place-address">
              <MapPin size={13} />
              {p.address || 'Adresse non renseignée'}
            </p>
            <div className="place-bottom">
              <span className="place-rating">
                <Star size={14} fill="currentColor" />
                <strong>{p.reviewCount ? p.rating.toFixed(1).replace('.', ',') : '—'}</strong>
                <span>({number.format(p.reviewCount)} avis)</span>
              </span>
              {p.distance !== null && (
                <span className="place-distance">{formatDistance(p.distance)}</span>
              )}
              <span
                className="ratio-pill"
                aria-label={`Score RatioMap ${p.score.toFixed(2)} sur 5`}
              >
                <span>RATIO</span>
                <strong>{p.score.toFixed(2).replace('.', ',')}</strong>
              </span>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}
