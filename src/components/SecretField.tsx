import { useState, type ChangeEvent } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name: string;
  placeholder?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  spellCheck?: boolean;
  id?: string;
};

/** Dots by default. Show lets the person read what they typed. */
export function SecretField({
  label,
  value,
  onChange,
  name,
  placeholder,
  autoComplete = 'off',
  autoCapitalize,
  spellCheck,
  id,
}: Props) {
  const [show, setShow] = useState(false);
  const onInput = (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value);
  return (
    <label className="secret-field" htmlFor={id}>
      <span>{label}</span>
      <span className="secret-field__row">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          spellCheck={spellCheck}
          onChange={onInput}
          aria-label={label}
        />
        <button type="button" aria-label={show ? `Hide ${label}` : `Show ${label}`} onClick={() => setShow((open) => !open)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}
