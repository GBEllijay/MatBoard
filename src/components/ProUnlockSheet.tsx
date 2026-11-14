import { type FormEvent, useState } from 'react';
import { redeemAccessCode } from '../lib/codeRedeemClient';
import { GYM_CONSOLE_NAME } from '../lib/productNames';
import { SecretField } from './SecretField';
import { Sheet } from './Sheet';

type Product = 'coach' | 'pro' | 'student';

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
    body: 'Turns on Advantage Instructor Edition on this browser. Soft beta only — not a login.',
    name: 'coach-unlock',
    placeholder: 'Owner code',
    submit: 'Unlock Instructor Edition',
  },
  student: {
    title: 'Owner unlock',
    body: 'Turns on Advantage Student Edition on this browser. Soft beta only — not a login.',
    name: 'student-unlock',
    placeholder: 'Owner code',
    submit: 'Unlock Student Edition',
  },
};

export function ProUnlockSheet({ open, onClose, product = 'pro' }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const copy = COPY[product];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    void redeemAccessCode(code).then((result) => {
      setPending(false);
      if (result.ok) {
        setCode('');
        setError('');
        onClose();
        return;
      }
      setError(result.error);
    });
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
        <SecretField
          label="Owner unlock code"
          name={copy.name}
          placeholder={copy.placeholder}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (error) setError('');
          }}
        />
        {error ? <p className="home__unlock-error">{error}</p> : null}
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Checking…' : copy.submit}
        </button>
      </form>
    </Sheet>
  );
}
