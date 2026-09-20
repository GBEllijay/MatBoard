import { type FormEvent, useState } from 'react';
import { tryUnlock } from '../lib/proUnlock';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ProUnlockSheet({ open, onClose }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tryUnlock(code)) {
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
    <Sheet open={open} title="Owner unlock" onClose={close}>
      <p className="home__unlock-copy">
        Turns on Owner’s Toolbox and Advantage Pro on this browser. Soft beta only — not a login.
      </p>
      <form className="home__unlock-form" onSubmit={submit}>
        <label>
          <span className="sr-only">Owner unlock code</span>
          <input
            type="password"
            name="pro-unlock"
            autoComplete="off"
            placeholder="Owner code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError('');
            }}
          />
        </label>
        {error ? <p className="home__unlock-error">{error}</p> : null}
        <button type="submit" className="btn">
          Unlock Pro
        </button>
      </form>
    </Sheet>
  );
}
