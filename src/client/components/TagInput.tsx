import { useEffect, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { addTag } from '../../shared/search';
import { DEPARTMENTS, locationLabel, normalize } from '../../shared/locations';
import { Combobox, type Suggestion } from './Combobox';

export function TagInput({
  values,
  onChange,
  location = false,
  label,
  max,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  location?: boolean;
  label: string;
  max: number;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [cities, setCities] = useState<Suggestion[]>([]);
  useEffect(() => {
    setCities([]);
    if (!location || value.trim().length < 3 || !window.google?.maps?.places?.AutocompleteService)
      return;
    let stale = false;
    const timer = setTimeout(() => {
      const service = new google.maps.places.AutocompleteService();
      void service
        .getPlacePredictions(
          { input: value, types: ['(cities)'], componentRestrictions: { country: 'fr' } },
          (predictions) => {
            if (!stale)
              setCities(
                (predictions || [])
                  .slice(0, 4)
                  .map((p) => ({ value: p.structured_formatting.main_text, label: p.description })),
              );
          },
        )
        .catch(() => {
          if (!stale) setCities([]);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, location]);
  function add(raw = value) {
    const next = addTag(values, raw, max, location);
    if (next === values && raw.trim()) {
      setError('Déjà ajouté, trop long ou invalide. Ajoutez une seule valeur à la fois.');
      return;
    }
    onChange(next);
    setValue('');
    setError('');
  }
  const suggestions =
    location && value.length >= 1
      ? DEPARTMENTS.filter(
          (d) => d.normalized.includes(normalize(value)) || d.code.startsWith(value.toUpperCase()),
        )
          .slice(0, 6)
          .map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))
      : [];
  return (
    <div className="tag-field">
      <label className="field-label" htmlFor={id}>
        {label}{' '}
        <span className="field-counter">
          {values.length}/{max}
        </span>
      </label>
      {values.length > 0 && (
        <ul className="tags">
          {values.map((value) => (
            <li key={value}>
              <span>{location ? locationLabel(value) : value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Retirer ${location ? locationLabel(value) : value}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {values.length < max && (
        <Combobox
          id={id}
          value={value}
          maxLength={location ? 100 : 80}
          onChange={(v) => {
            setValue(v);
            setError('');
          }}
          onCommit={() => add()}
          onSelect={add}
          suggestions={[
            ...suggestions,
            ...cities.map((s) => ({ ...s, label: `${s.label} · Google` })),
          ]}
          placeholder={location ? 'Ville, département ou Paris 1er…' : 'Buffet, terrasse, accueil…'}
          trailing={
            <button
              type="button"
              className="icon-button"
              onClick={() => add()}
              aria-label={`Ajouter ${location ? 'la zone' : 'le mot-clé'}`}
            >
              <Plus size={18} />
            </button>
          }
        />
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
