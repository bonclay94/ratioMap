import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export interface Suggestion {
  value: string;
  label: string;
}
interface Props extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'onSelect'
> {
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  onSelect?: (value: string) => void;
  onCommit?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}
export function Combobox({
  value,
  onChange,
  suggestions,
  onSelect,
  onCommit,
  leading,
  trailing,
  ...props
}: Props) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const open = expanded && suggestions.length > 0;
  function select(item: Suggestion) {
    if (onSelect) onSelect(item.value);
    else onChange(item.value);
    setExpanded(false);
    setActive(-1);
  }
  return (
    <div className="combobox">
      <div className="input-wrap">
        {leading}
        <input
          {...props}
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setExpanded(true);
            setActive(-1);
          }}
          onFocus={() => setExpanded(true)}
          onBlur={() => setExpanded(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setExpanded(false);
              e.stopPropagation();
            }
            if (e.key === 'ArrowDown' && suggestions.length) {
              e.preventDefault();
              setExpanded(true);
              setActive((i) => (i + 1) % suggestions.length);
            }
            if (e.key === 'ArrowUp' && suggestions.length) {
              e.preventDefault();
              setExpanded(true);
              setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
            }
            if (e.key === 'Enter') {
              if (open && active >= 0) {
                e.preventDefault();
                select(suggestions[active]);
              } else if (onCommit) {
                e.preventDefault();
                onCommit();
                setExpanded(false);
              } else setExpanded(false);
            }
          }}
        />
        {trailing}
      </div>
      {open && (
        <ul id={listId} role="listbox" className="suggestions">
          {suggestions.map((item, i) => (
            <li
              role="option"
              id={`${listId}-${i}`}
              key={item.value}
              aria-selected={i === active}
              onPointerDown={(e) => {
                e.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
