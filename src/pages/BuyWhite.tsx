import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { lookupWhiteEntitlement, type WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import {
  WHITE_CHECKOUT_API,
  WHITE_FREE_CODE,
  WHITE_INCLUDED,
  WHITE_NOT_INCLUDED,
  WHITE_PRICE_LABEL,
  WHITE_UPGRADE_NOTE,
  isWhiteFreeCode,
} from '../lib/whitePurchase';

export function BuyWhitePage() {
  const [params] = useSearchParams();
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<WhiteEntitlementStatus | null>(null);
  const [freeUnlock, setFreeUnlock] = useState(false);
  const freeCode = isWhiteFreeCode(code);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Buy Advantage White';
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (checkout !== 'success' || !sessionId) return;
    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const tick = async () => {
      const status = await lookupWhiteEntitlement({ sessionId });
      if (cancelled) return;
      attempts += 1;
      if (status.entitled || attempts >= 4) {
        setRecord(status);
        return;
      }
      timer = window.setTimeout(() => void tick(), 1000);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkout, sessionId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ promotionCode: code.trim() }),
      });
      const body = (await response.json()) as { url?: string; error?: string; entitled?: boolean };
      if (response.ok && body.entitled && !body.url) {
        setFreeUnlock(true);
        setPending(false);
        return;
      }
      if (!response.ok || !body.url) {
        setError(body.error || 'Checkout could not start.');
        setPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError('Checkout could not start. Check your connection and try again.');
      setPending(false);
    }
  }

  return (
    <main className="home home--white home--buy">
      <div className="home__inner">
        <HomeMark to="/" tagline={<TierLine tier="White" detail="One-time purchase" />} />
        <article className="buy">
          <header className="buy__card">
            <h2>Advantage White</h2>
            <p className="buy__price">
              {WHITE_PRICE_LABEL} <span>USD, one time</span>
            </p>
            <p>Pay once. Card details are entered on Stripe, not on this page.</p>
          </header>

          {checkout === 'success' ? (
            <p className="buy__status buy__status--ok" role="status">
              {record?.entitled
                ? `Advantage White is recorded${record.email ? ` for ${record.email}` : ''}.`
                : 'Payment submitted. Advantage records it when Stripe sends checkout.session.completed.'}
            </p>
          ) : null}
          {checkout === 'cancel' ? (
            <p className="buy__status" role="status">
              Checkout canceled. No charge was made.
            </p>
          ) : null}

          <section className="buy__card">
            <h3>Included</h3>
            <ul>
              {WHITE_INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="buy__card">
            <h3>Not included</h3>
            <ul>
              {WHITE_NOT_INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{WHITE_UPGRADE_NOTE}</p>
          </section>

          <form className="buy__card" onSubmit={(event) => void onSubmit(event)}>
            <label className="buy__label" htmlFor="white-promo">
              Promo or unlock code
            </label>
            <input
              id="white-promo"
              name="promotionCode"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              placeholder={WHITE_FREE_CODE}
              onChange={(event) => setCode(event.target.value)}
            />
            <p>
              Enter {WHITE_FREE_CODE} to unlock White at $0 on this page, with no card. Other codes
              continue to Stripe.
            </p>
            {freeUnlock ? (
              <p className="buy__status buy__status--ok" role="status">
                Advantage White is unlocked at $0. No card was charged.
              </p>
            ) : null}
            {error ? (
              <p className="buy__status buy__status--bad" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn btn--white" type="submit" disabled={pending}>
              {pending
                ? freeCode
                  ? 'Unlocking…'
                  : 'Opening checkout…'
                : freeCode
                  ? 'Unlock White'
                  : `Continue to checkout — ${WHITE_PRICE_LABEL}`}
            </button>
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to="/white">Open White</Link>
            </p>
          </form>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
