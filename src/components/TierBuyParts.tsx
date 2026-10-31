import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from './AlphaAccessNote';
import { higherTiers, type TierBelt, type TierBuyEntry, type TierId } from '../lib/tierBuyPages';
import { restoreWhiteByEmail } from '../lib/whiteUnlock';
import '../pages/buyTiers.css';

/**
 * Small belt icon in the homepage ladder color. Black wears the ladder's red rank
 * bar so the bar shows on the black cloth.
 */
export function TierBeltIcon({ belt, big = false }: { belt: TierBelt; big?: boolean }) {
  return (
    <span
      className={`belt-tip belt-tip--${belt} belt-tip--ladder${big ? ' buy__belt' : ''}`}
      aria-hidden="true"
      data-belt={belt}
    >
      <span className={`belt-tip__bar${belt === 'black' ? ' belt-tip__bar--red' : ''}`} />
    </span>
  );
}

/** One higher-tier card: belt icon, kicker, name, price, one line, alpha line, link to its buy page. */
export function TierCard({
  tier,
  kicker = 'Coming soon',
  children,
}: {
  tier: TierBuyEntry;
  kicker?: string;
  /** Extra controls under the blurb (the /buy Student checkout). */
  children?: ReactNode;
}) {
  return (
    <section className={`buy__card buy__soon buy__tier buy__tier--${tier.id}`} aria-label={tier.name} data-tier={tier.id}>
      <div className="buy__soon-head">
        <TierBeltIcon belt={tier.belt} />
        <span>
          <span className="buy__kicker">{kicker}</span>
          <h2>{tier.name}</h2>
        </span>
      </div>
      <p className="buy__price">
        {tier.price} <span>{tier.priceDetail}</span>
      </p>
      <p>{tier.blurb}</p>
      {children}
      {tier.alpha ? <AlphaAccessNote note={tier.alpha.note} display={tier.alpha.display} /> : null}
      <Link className="buy__more" to={tier.path}>
        See what’s included
      </Link>
    </section>
  );
}

/** Only the tiers above `from`, in ladder order. Renders nothing for Pro. */
export function HigherTierList({
  from,
  kickers,
  extras,
}: {
  from: TierId;
  kickers?: Partial<Record<TierId, string>>;
  extras?: Partial<Record<TierId, ReactNode>>;
}) {
  const tiers = higherTiers(from);
  if (tiers.length === 0) return null;
  return (
    <div className="buy buy__higher" data-higher-tiers={from}>
      {tiers.map((tier) => (
        <TierCard key={tier.id} tier={tier} kicker={kickers?.[tier.id]}>
          {extras?.[tier.id]}
        </TierCard>
      ))}
    </div>
  );
}

/** Same restore form as /buy (restoreWhiteByEmail restores every purchase on that email). */
export function TierRestoreCard({ label }: { label: string }) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setNote(null);
    setPending(true);
    const result = await restoreWhiteByEmail(email);
    if (!result.ok) setError(result.error);
    else setNote(result.message);
    setPending(false);
  }

  return (
    <form className="buy__card buy__restore" onSubmit={(event) => void onRestore(event)}>
      <h3>Already purchased?</h3>
      <p>
        Enter the email from checkout. If it matches a purchase, we email a one-time code. This page does not say
        whether that address bought anything. <Link to="/restore">Open the restore page</Link>.
      </p>
      <label className="buy__field">
        <span>Purchase email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
        />
      </label>
      {error ? (
        <p className="buy__status buy__status--bad" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="buy__status buy__status--ok" role="status">
          {note}
        </p>
      ) : null}
      <button className="btn btn--ghost" type="submit" disabled={pending}>
        {pending ? 'Checking…' : label}
      </button>
    </form>
  );
}
