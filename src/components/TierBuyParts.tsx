import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlphaAccessNote } from './AlphaAccessNote';
import { LEARN_MORE } from '../lib/learnMore';
import { PRO_PLUS_CLOUD_DESCRIPTION, PRO_PLUS_CLOUD_INFO_PATH, PRO_PLUS_CLOUD_NAME } from '../lib/productNames';
import { EDITION_ALPHA_NOTE, EDITION_EMAIL_DISPLAY, PRO_PLUS_CLOUD_PRICE_LINE } from '../lib/productPrices';
import { higherTiers, type TierBelt, type TierBuyEntry, type TierId } from '../lib/tierBuyPages';
import { useRestoreSession } from '../hooks/useRestoreSession';
import { sessionEmailHint, startSignedInRestore } from '../lib/restorePurchase';
import { saveRestoreChallenge } from '../lib/restoreChallenge';
import { restoreHref } from '../lib/whiteUnlock';
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
  kicker = 'This product is in alpha',
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
        {LEARN_MORE[tier.id].label}
      </Link>
    </section>
  );
}

/**
 * Pro Plus Cloud on the White buy page. Same Coming soon card as the products
 * ladder. No checkout: the info page is the existing link.
 */
export function ProCloudBuyCard() {
  return (
    <section className="buy__card buy__soon buy__tier buy__tier--pro-cloud" aria-label={PRO_PLUS_CLOUD_NAME} data-tier="pro-cloud">
      <div className="buy__soon-head">
        <span className="belt-tip belt-tip--black belt-tip--ladder" aria-hidden="true" data-belt="black">
          <span className="belt-tip__bar belt-tip__bar--red" />
        </span>
        <span>
          <span className="buy__kicker">This product is in alpha</span>
          <h2>{PRO_PLUS_CLOUD_NAME}</h2>
        </span>
      </div>
      <p className="buy__price">
        {PRO_PLUS_CLOUD_PRICE_LINE} <span>USD — monthly, when it launches</span>
      </p>
      <p>{PRO_PLUS_CLOUD_DESCRIPTION}</p>
      <AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />
      <Link className="buy__more" to={PRO_PLUS_CLOUD_INFO_PATH}>
        {LEARN_MORE.proCloud.label}
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

/** Already-purchased entry on the tier buy pages. Signed-out visitors still go to /restore to enter an email. A signed-in session sends the code immediately. */
export function TierRestoreCard({ label }: { label: string }) {
  const signedIn = useRestoreSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = sessionEmailHint();

  async function onSignedInRestore() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await startSignedInRestore();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      if (result.needsEmail) navigate('/restore');
      return;
    }
    if (result.challengeId) saveRestoreChallenge(result.challengeId);
    navigate('/restore', { state: { restoreSent: true, message: result.message, emailHint: result.emailHint } });
  }

  if (signedIn) {
    return (
      <section className="buy__card buy__restore" aria-label="Already purchased">
        <h3>Already purchased?</h3>
        <p>
          Send a one-time code to the email on file for this session. You will land on the restore page to enter
          the code. The full address is never shown.
        </p>
        {hint ? <p className="buy__status">We will email {hint}.</p> : null}
        {error ? (
          <p className="buy__status buy__status--bad" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn--ghost" type="button" onClick={() => void onSignedInRestore()} disabled={pending}>
          {pending ? 'Sending…' : label}
        </button>
      </section>
    );
  }

  return (
    <section className="buy__card buy__restore" aria-label="Already purchased">
      <h3>Already purchased?</h3>
      <p>
        Enter the email from checkout, then open the restore page. That page has the person check and emails a
        one-time code. This page does not say whether that address bought anything.
      </p>
      <label className="buy__field">
        <span>Purchase email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <Link className="btn btn--ghost" to={restoreHref(email)}>
        {label}
      </Link>
    </section>
  );
}
