import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { TierLine } from '../components/TierLine';
import { lookupWhiteEntitlement, type WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import {
  WHITE_CHECKOUT_API,
  WHITE_INCLUDED,
  WHITE_NOT_INCLUDED,
  WHITE_PRICE_LABEL,
  WHITE_UPGRADE_NOTE,
} from '../lib/whitePurchase';

export function BuyWhitePage() {
  const [params] = useSearchParams();
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<WhiteEntitlementStatus | null>(null);

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
      const body = (await response.json()) as { url?: string; error?: string };
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
              Promo code
            </label>
            <input
              id="white-promo"
              name="promotionCode"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              placeholder="Optional"
              onChange={(event) => setCode(event.target.value)}
            />
            <p>Leave this blank to enter a code on the Stripe page.</p>
            {error ? (
              <p className="buy__status buy__status--bad" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn btn--white" type="submit" disabled={pending}>
              {pending ? 'Opening checkout…' : `Continue to checkout — ${WHITE_PRICE_LABEL}`}
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
