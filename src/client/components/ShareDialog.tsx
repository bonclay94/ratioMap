import { useEffect, useState } from 'react';
import { Check, Copy, Link } from 'lucide-react';
import type { SearchState } from '../../shared/types';
import { buildSearchParams } from '../../shared/search';
import { requestJson } from '../api';
import { Modal } from './Modal';

export function ShareDialog({ state, onClose }: { state: SearchState; onClose: () => void }) {
  const [url, setUrl] = useState(`${window.location.origin}/?${buildSearchParams(state)}`);
  const [status, setStatus] = useState('Le lien complet est prêt.');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestJson<{ id: string; temporary: boolean }>('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(buildSearchParams(state))),
      signal: controller.signal,
    })
      .then((data) => {
        if (!data.temporary && /^[\w-]{7,24}$/.test(data.id)) {
          setUrl(`${window.location.origin}/s/${data.id}`);
          setStatus('Votre lien court est prêt.');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus('Le lien court est indisponible. Ce lien complet fonctionne aussi.');
      });
    return () => controller.abort();
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setStatus('Sélectionnez le lien ci-dessous pour le copier manuellement.');
    }
  }
  return (
    <Modal title="Partager cette recherche" onClose={onClose}>
      <div className="share-content">
        <p>
          Ce lien reprend la recherche affichée et ses filtres. Il inclut l’adresse et la position
          utilisées pour la recherche.
        </p>
        <label className="field-label" htmlFor="share-url">
          Lien de la recherche
        </label>
        <div className="input-wrap">
          <Link size={18} />
          <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
        </div>
        <button type="button" className="primary-button" onClick={() => void copy()}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Lien copié' : 'Copier le lien'}
        </button>
        <p className="field-hint" role="status">
          {status}
        </p>
      </div>
    </Modal>
  );
}
