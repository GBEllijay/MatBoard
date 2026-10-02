import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { lookupWhiteEntitlement, type WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import {
  WHITE_CHECKOUT_API,
  WHITE_FEATURES,
  WHITE_INCLUDED,
  WHITE_PRICE_DETAIL,
  WHITE_PRICE_LABEL,
  WHITE_STRIPE_NOTE,
  WHITE_UPGRADE_NOTE,
  isWhiteFreeCode,
} from '../lib/whitePurchase';

type FreeLinkResult = { ok: true } | { ok: false; error: string };

let freeLinkPromise: Promise<FreeLinkResult> | null = null;

function unlockFromPrivateLink(code: string): Promise<FreeLinkResult> {
  if (!freeLinkPromise) {
    freeLinkPromise = (async () => {
      try {
        const response = await fetch(WHITE_CHECKOUT_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ promotionCode: code }),
        });
        const body = (await response.json()) as { url?: string; error?: string; entitled?: boolean };
        if (response.ok && body.entitled && !body.url) return { ok: true };
        freeLinkPromise = null;
        return { ok: false, error: body.error || 'Unlock could not be recorded.' };
      } catch {
        freeLinkPromise = null;
        return { ok: false, error: 'Unlock could not be recorded. Check your connection and try again.' };
      }
    })();
  }
  return freeLinkPromise;
}

export function BuyWhitePage() {
  const [params, setParams] = useSearchParams();
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');
  const code = params.get('code') ?? '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<WhiteEntitlementStatus | null>(null);
  const [freeUnlock, setFreeUnlock] = useState(false);

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

  useEffect(() => {
    if (!code || isWhiteFreeCode(code)) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('code');
        return next;
      },
      { replace: true },
    );
  }, [code, setParams]);

  useEffect(() => {
    if (!isWhiteFreeCode(code)) return;
    let active = true;
    void unlockFromPrivateLink(code.trim()).then((result) => {
      if (!active) return;
      if (result.ok) {
        setFreeUnlock(true);
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('code');
            return next;
          },
          { replace: true },
        );
        return;
      }
      setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [code, setParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
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
        <HomeMark to="/" />
        <article className="buy">
          <header className="buy__card buy__card--belt">
            <span className="belt-tip belt-tip--white buy__belt" aria-hidden="true">
              <span className="belt-tip__bar" />
            </span>
            <h2>Advantage White</h2>
            <p className="buy__price">
              {WHITE_PRICE_LABEL} <span>{WHITE_PRICE_DETAIL}</span>
            </p>
            <p>{WHITE_STRIPE_NOTE}</p>
          </header>

          <section className="buy__card">
            <div className="buy__block">
              <h3>Included</h3>
              <ul>
                {WHITE_INCLUDED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="buy__block">
              <h3>Features</h3>
              <ul>
                {WHITE_FEATURES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          <form className="buy__card" onSubmit={(event) => void onSubmit(event)}>
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
          <p className="buy__later">{WHITE_UPGRADE_NOTE}</p>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
