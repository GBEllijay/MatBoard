import { type FormEvent, useState } from 'react';
import { tryCoachUnlock } from '../lib/coachUnlock';
import { GYM_CONSOLE_NAME } from '../lib/productNames';
import { tryUnlock } from '../lib/proUnlock';
import { Sheet } from './Sheet';

type Product = 'coach' | 'pro';

type Props = {
  open: boolean;
  onClose: () => void;
  product?: Product;
};

const COPY: Record<
  Product,
  { title: string; body: string; name: string; placeholder: string; submit: string }
> = {
  pro: {
    title: 'Owner unlock',
    body: `Turns on Advantage Pro and ${GYM_CONSOLE_NAME} on this browser. Soft beta only — not a login.`,
    name: 'pro-unlock',
    placeholder: 'Owner code',
    submit: 'Unlock Pro',
  },
  coach: {
    title: 'Owner unlock',
    body: 'Turns on Advantage Coach on this browser. Soft beta only — not a login.',
    name: 'coach-unlock',
    placeholder: 'Owner code',
    submit: 'Unlock Coach',
  },
};

export function ProUnlockSheet({ open, onClose, product = 'pro' }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const copy = COPY[product];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ok = product === 'coach' ? tryCoachUnlock(code) : tryUnlock(code);
    if (ok) {
      setCode('');
      setError('');
      onClose();
      return;
    }
    setError('That code did not match.');
  };

  const close = () => {
    setCode('');
    setError('');
    onClose();
  };

  return (
    <Sheet open={open} title={copy.title} onClose={close}>
      <p className="home__unlock-copy">{copy.body}</p>
      <form className="home__unlock-form" onSubmit={submit}>
        <label>
          <span className="sr-only">Owner unlock code</span>
          <input
            type="password"
            name={copy.name}
            autoComplete="off"
            placeholder={copy.placeholder}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError('');
            }}
          />
        </label>
        {error ? <p className="home__unlock-error">{error}</p> : null}
        <button type="submit" className="btn">
          {copy.submit}
        </button>
      </form>
    </Sheet>
  );
}
