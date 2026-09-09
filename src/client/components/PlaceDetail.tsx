import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Clock3,
  ExternalLink,
  Globe,
  LoaderCircle,
  MapPin,
  Navigation,
  Phone,
  Star,
} from 'lucide-react';
import type { Place, PlaceDetails } from '../../shared/types';
import { safeHttpUrl } from '../../shared/search';
import { requestJson } from '../api';
import { Modal } from './Modal';
import { OpenStatus } from './Results';

export function PlaceDetail({ place, onClose }: { place: Place; onClose: () => void }) {
  const [detail, setDetail] = useState<PlaceDetails | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setDetail(null);
    requestJson<PlaceDetails>(
      `/api/place-details?${new URLSearchParams({ placeId: place.placeId })}`,
      { signal: controller.signal },
    )
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [place.placeId, retry]);
  const website = safeHttpUrl(detail?.website);
  const mapsUrl = safeHttpUrl(detail?.mapsUrl) || safeHttpUrl(place.mapsUrl)!;
  const destination =
    place.lat !== null && place.lng !== null
      ? `${place.lat},${place.lng}`
      : place.address || place.name;
  const directions = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination, destination_place_id: place.placeId })}`;
  const phone = detail?.phone?.replace(/[^+\d]/g, '');
  return (
    <Modal title={place.name} onClose={onClose} className="place-modal">
      <div className="detail-summary">
        <p className="detail-category">{detail?.category || place.category || 'Lieu'}</p>
        <div className="detail-rating">
          <Star size={18} fill="currentColor" />
          <strong>
            {place.reviewCount ? place.rating.toFixed(1).replace('.', ',') : 'Sans note'}
          </strong>
          <span>{place.reviewCount.toLocaleString('fr-FR')} avis Google</span>
          <span className="ratio-pill">
            <span>RATIO</span>
            <strong>{place.score.toFixed(2).replace('.', ',')}</strong>
          </span>
        </div>
        <OpenStatus value={detail ? detail.openNow : place.openNow} />
      </div>
      <nav className="detail-actions" aria-label="Actions sur le lieu">
        <a className="primary-button" href={directions} target="_blank" rel="noopener noreferrer">
          <Navigation size={17} /> Itinéraire
        </a>
        {phone && (
          <a className="secondary-button" href={`tel:${phone}`}>
            <Phone size={17} /> Appeler
          </a>
        )}
        {website && (
          <a className="secondary-button" href={website} target="_blank" rel="noopener noreferrer">
            <Globe size={17} /> Site web
          </a>
        )}
      </nav>
      <div className="detail-address">
        <MapPin size={19} />
        <p>{detail?.address || place.address || 'Adresse non renseignée'}</p>
      </div>
      {!detail && !error && (
        <p className="loading-message" role="status">
          <LoaderCircle size={18} className="spin" /> Chargement des horaires et avis…
        </p>
      )}
      {error && (
        <div className="error-message" role="alert">
          <p>{error}</p>
          <button type="button" className="text-button" onClick={() => setRetry((r) => r + 1)}>
            Réessayer
          </button>
        </div>
      )}
      {detail && (
        <>
          <section className="detail-section">
            <h3>
              <Clock3 size={18} /> Horaires habituels
            </h3>
            {detail.weekdayText?.length ? (
              <ul className="hours-list">
                {detail.weekdayText.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="field-hint">Horaires non renseignés.</p>
            )}
          </section>
          <section className="detail-section">
            <div className="section-heading">
              <h3>Avis récents ou pertinents</h3>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                Google Maps <ArrowUpRight size={14} />
              </a>
            </div>
            <p className="field-hint">Une sélection fournie par Google, jusqu’à cinq avis.</p>
            {!detail.reviews.length ? (
              <p className="empty-review">Aucun avis écrit disponible.</p>
            ) : (
              <ul className="reviews-list">
                {detail.reviews.map((r, i) => (
                  <li key={`${r.author}-${i}`}>
                    <div className="review-header">
                      <span className="review-avatar" aria-hidden="true">
                        {r.author.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        {safeHttpUrl(r.authorUrl) ? (
                          <a
                            href={safeHttpUrl(r.authorUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {r.author}
                          </a>
                        ) : (
                          <strong>{r.author}</strong>
                        )}
                        <p>{r.relativeTime}</p>
                      </div>
                      <span className="review-rating">
                        <Star size={13} fill="currentColor" />
                        {r.rating}
                      </span>
                    </div>
                    <p className="review-text">
                      {r.text || 'Cet avis ne contient pas de commentaire.'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {detail.attributions?.map((credit, i) => (
            <p className="attribution" key={i}>
              {credit}
            </p>
          ))}
        </>
      )}
      <a className="detail-google-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
        Voir la fiche complète sur Google Maps <ExternalLink size={16} />
      </a>
    </Modal>
  );
}
