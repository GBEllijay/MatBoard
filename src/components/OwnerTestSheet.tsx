import { type FormEvent, useState } from 'react';
import { clearOwnerTestUnlock, submitOwnerTest, submitOwnerTestOrCode } from '../lib/codeRedeemClient';
import { Sheet } from './Sheet';

const TIERS = [
  ['all', 'All tiers'],
  ['white', 'White'],
  ['student', 'Student Edition'],
  ['coach', 'Coach'],
  ['pro', 'Pro'],
  ['media', 'Media Edition'],
  ['seat', 'Instructor seat'],
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * The secret is typed here and sent to the server. It is not stored in the
 * page, the address bar, or the built script.
 */
export function OwnerTestSheet({ open, onClose }: Props) {
  const [secret, setSecret] = useState('');
  const [tier, setTier] = useState<(typeof TIERS)[number][0]>('all');
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const close = () => {
    setSecret('');
    setError('');
    setNote('');
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setNote('');
    void submitOwnerTestOrCode({ secret, tier, days }).then((result) => {
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSecret('');
      setNote(result.via === 'code' ? 'That was an unlock code, not the test secret. It is redeemed on this browser.' : 'Test unlock is on for this browser.');
    });
  };

  const clear = () => {
    clearOwnerTestUnlock();
    setNote('Test unlock cleared on this browser.');
    setError('');
    if (!secret.trim()) return;
    void submitOwnerTest({ secret, tier, days, action: 'clear' });
  };

  return (
    <Sheet open={open} title="Owner test unlock" onClose={close}>
      <p className="home__unlock-copy">
        Unlocks a tier on this phone or computer so you can test. It is not a customer code, and the address bar cannot turn it on.
      </p>
      <form className="home__unlock-form" onSubmit={submit}>
        <label>
          <span className="sr-only">Owner test secret</span>
          <input
            type="password"
            name="owner-test-secret"
            autoComplete="off"
            placeholder="Owner test secret"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
              if (error) setError('');
            }}
          />
        </label>
        <label>
          <span className="sr-only">Tier</span>
          <select name="owner-test-tier" value={tier} onChange={(event) => setTier(event.target.value as (typeof TIERS)[number][0])}>
            {TIERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">How long</span>
          <select name="owner-test-days" value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>
            <option value="1">24 hours</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        {error ? <p className="home__unlock-error">{error}</p> : null}
        {note ? <p className="home__unlock-copy">{note}</p> : null}
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Checking…' : 'Unlock for testing'}
        </button>
        <button type="button" className="btn" onClick={clear}>
          Clear test unlock
        </button>
      </form>
    </Sheet>
  );
}
