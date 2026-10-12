import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { applyInterpretation } from '../../shared/interpretation';
import type { Filters, SearchDraft, SearchInterpretation } from '../../shared/types';
import { requestJson } from '../api';

const MAX_LENGTH = 200;
interface Props {
  draft: SearchDraft;
  onApply: (draft: SearchDraft, filters: Filters) => void;
}
export function NaturalSearch({ draft, onApply }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ summary: string[]; unsupported: string[] } | null>(null);
  const controller = useRef<AbortController | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const interpretation = await requestJson<SearchInterpretation>('/api/interpret-search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: current.signal,
      });
      if (current.signal.aborted) return;
      const applied = applyInterpretation(draft, interpretation);
      onApply(applied.draft, applied.filters);
      setResult({ summary: applied.summary, unsupported: interpretation.unsupported });
    } catch (error) {
      if (!current.signal.aborted)
        setError(error instanceof Error ? error.message : 'L’assistant n’a pas répondu.');
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }
  return (
    <div className="natural-search">
      <form onSubmit={submit} aria-label="Décrire ma recherche">
        <label htmlFor="natural-query">Décrire ma recherche</label>
        <div className="input-wrap">
          <Sparkles size={18} />
          <input
            id="natural-query"
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex. : resto pas cher ouvert ce soir"
            autoComplete="off"
          />
          <button className="secondary-button" type="submit" disabled={busy || !text.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {busy ? 'Analyse…' : 'Remplir'}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {result && (
        <div className="interpretation" role="status">
          <p className="field-hint">
            Formulaire rempli. Vérifiez, puis lancez la recherche. Les lieux restent classés par
            ratio.
          </p>
          <ul>
            {result.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {result.unsupported.length > 0 && (
            <p className="field-hint">
              Non pris en charge, ignoré : {result.unsupported.join(', ')}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
