import { useState } from 'react';
import { fieldSuggestions, suggestionHint, type FieldKind } from '../../lib/divisionFields';

/**
 * Searchable division or weight class. Suggestions filter as the student types.
 * Any other text stays in the field and is saved with the form.
 */
export function SuggestField({
  label,
  ariaLabel,
  value,
  kind,
  used,
  onChange,
}: {
  label: string;
  /** Accessible name when it differs from the visible label. */
  ariaLabel?: string;
  value: string;
  kind: FieldKind;
  used: readonly string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = ariaLabel ?? label;
  const options = open ? fieldSuggestions(kind, used, value) : [];
  const listId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-suggestions`;
  const emptyId = `${listId}-empty`;
  const showEmpty = open && options.length === 0;
  const choose = (option: string) => {
    onChange(option);
  };
  return (
    <div className="field-block">
      <label>
        <span className="ink__label">{label}</span>
        <input
          aria-label={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={options.length ? listId : showEmpty ? emptyId : undefined}
          autoComplete="off"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setOpen(true);
            onChange(event.target.value);
          }}
        />
      </label>
      {options.length ? (
        <div id={listId} className="field-suggest" role="listbox" aria-label={`${name} suggestions`}>
          {options.map((option) => {
            const hint = suggestionHint(option);
            return (
              <button
                key={option}
                type="button"
                className="field-suggest__option"
                role="option"
                aria-label={option}
                aria-selected={option.toLowerCase() === value.trim().toLowerCase()}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
              >
                <span className="field-suggest__value">{option}</span>
                {hint ? <span className="field-suggest__hint">{hint}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {showEmpty ? (
        <p id={emptyId} className="field-suggest__empty" role="status">
          {value.trim() ? 'No matches. Your text is saved as typed.' : 'No suggestions yet. Type your own.'}
        </p>
      ) : null}
    </div>
  );
}
