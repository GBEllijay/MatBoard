import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { ComingSoonAd } from '../components/ComingSoonAd';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { confirmCheckoutSession, redeemAccessCode, withCheckoutNonce } from '../lib/codeRedeemClient';
import type { WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import {
  COACH_LIST_PRICE_CENTS,
  PRO_LIST_PRICE_CENTS,
  PRO_MONTHLY_PRICE_CENTS,
  STUDENT_ALPHA_ACCESS_NOTE,
  STUDENT_LIST_PRICE_CENTS,
} from '../lib/productPrices';
import { PRODUCTS_PATH, STUDENT_EDITION_NAME } from '../lib/productNames';
import { studentEditionEntitled } from '../lib/studentEdition';
import { buyCheckoutBody } from '../lib/halfOff';
import {
  WHITE_CHECKOUT_API,
  WHITE_FEATURES,
  WHITE_INCLUDED,
  WHITE_PRICE_DETAIL,
  WHITE_PRICE_LABEL,
  WHITE_STRIPE_NOTE,
  formatUsdFromCents,
} from '../lib/whitePurchase';
import { rememberWhitePurchase, restoreWhiteByEmail } from '../lib/whiteUnlock';

export function BuyWhitePage() {
  const [params, setParams] = useSearchParams();
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');
  const code = params.get('code') ?? '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<WhiteEntitlementStatus | null>(null);
  const [freeUnlock, setFreeUnlock] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [restoreEmail, setRestoreEmail] = useState('');
  const [restorePending, setRestorePending] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const [studentPending, setStudentPending] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const halfOff = useHalfOffArrival();
  const unlocked = useWhiteUnlocked();
  const studentOpen = studentEditionEntitled({
    pro: useProUnlocked(),
    coach: useCoachUnlocked(),
    white: unlocked,
    student: useStudentEditionUnlocked(),
  });

  useEffect(() => {
    const previous = document.title;
    document.title = 'Buy Advantage';
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (checkout !== 'success' || !sessionId) return;
    let cancelled = false;
    setConfirming(true);
    void confirmCheckoutSession(sessionId).then((result) => {
      if (cancelled) return;
      setConfirming(false);
      if (result.ok && result.grants.includes('white')) {
        rememberWhitePurchase({ entitled: true, grants: result.grants });
        setRecord({ entitled: true, product: result.product });
        return;
      }
      setRecord({ entitled: false });
      if (!result.ok) setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [checkout, sessionId]);

  useEffect(() => {
    if (!code) return;
    let active = true;
    void redeemAccessCode(code).then((result) => {
      if (!active) return;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('code');
          return next;
        },
        { replace: true },
      );
      if (result.ok) {
        setFreeUnlock(true);
        return;
      }
      setPromoInput(code);
      setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [code, setParams]);

  async function onRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (restorePending) return;
    setRestoreError(null);
    setRestoreNote(null);
    setRestorePending(true);
    const result = await restoreWhiteByEmail(restoreEmail);
    if (!result.ok) setRestoreError(result.error);
    else setRestoreNote(result.message);
    setRestorePending(false);
  }

  async function onStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (studentPending || !studentOpen) return;
    setStudentError(null);
    setStudentPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(await withCheckoutNonce(buyCheckoutBody({ product: 'student', halfOffActive: halfOff }))),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setStudentError(body.error || 'Checkout could not start.');
        setStudentPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setStudentError('Checkout could not start. Check your connection and try again.');
      setStudentPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const typed = promoInput.trim();
    if (unlocked && !typed) return;
    if (typed) {
      setPending(true);
      const redeemed = await redeemAccessCode(typed);
      if (redeemed.ok) {
        setPending(false);
        setFreeUnlock(true);
        setPromoInput('');
        return;
      }
      if (redeemed.error !== "That code didn't work.") {
        setPending(false);
        setError(redeemed.error);
        return;
      }
    }
    setPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(await withCheckoutNonce(buyCheckoutBody({ typedPromo: typed, halfOffActive: halfOff }))),
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
            <p className="buy__kicker">Available now</p>
            <h2>Advantage White</h2>
            <p className="buy__price">
              {WHITE_PRICE_LABEL} <span>{WHITE_PRICE_DETAIL}</span>
            </p>
            <p>{WHITE_STRIPE_NOTE}</p>
          </header>

          <form className="buy__card buy__checkout" onSubmit={(event) => void onSubmit(event)}>
            <HalfOffCheckoutNote active={halfOff} />
            {checkout === 'success' ? (
              <p className="buy__status buy__status--ok" role="status">
                {confirming
                  ? 'Confirming that payment with Stripe.'
                  : record?.entitled
                    ? 'Advantage White is unlocked on this device.'
                    : "That payment isn't confirmed. Nothing was unlocked."}
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
            {unlocked && !freeUnlock && checkout !== 'success' ? (
              <p className="buy__status buy__status--ok" role="status">
                Advantage White is unlocked on this device.
              </p>
            ) : null}
            {error ? (
              <p className="buy__status buy__status--bad" role="alert">
                {error}
              </p>
            ) : null}
            <label className="buy__code" htmlFor="promotion-code">
              Unlock or promo code
              <input
                id="promotion-code"
                name="promotionCode"
                value={promoInput}
                onChange={(event) => setPromoInput(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="done"
                aria-label="Unlock or promo code"
                placeholder="Optional"
              />
            </label>
            <p className="buy__hint">
              Optional. An unlock code opens Advantage White on this device. A promo code applies at Stripe checkout.
            </p>
            {unlocked ? (
              <Link className="btn btn--white" to="/white">
                Open White
              </Link>
            ) : null}
            {!unlocked || promoInput.trim() ? (
              <button className="btn btn--white" type="submit" disabled={pending}>
                {pending
                  ? 'Opening checkout…'
                  : unlocked
                    ? 'Apply code'
                    : `Continue to checkout — ${WHITE_PRICE_LABEL}`}
              </button>
            ) : null}
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={PRODUCTS_PATH}>All editions</Link>
            </p>
          </form>

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

          {unlocked ? null : (
            <form className="buy__card" onSubmit={(event) => void onRestore(event)}>
              <h3>Already purchased?</h3>
              <p>
                Enter the email from checkout. If it matches a purchase, we email a one-time code. This page does not
                say whether that address bought anything.{' '}
                <Link to="/restore">Open the restore page</Link>.
              </p>
              <label className="buy__field">
                <span>Purchase email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={restoreEmail}
                  onChange={(event) => {
                    setRestoreEmail(event.target.value);
                    if (restoreError) setRestoreError(null);
                  }}
                />
              </label>
              {restoreError ? (
                <p className="buy__status buy__status--bad" role="alert">
                  {restoreError}
                </p>
              ) : null}
              {restoreNote ? (
                <p className="buy__status buy__status--ok" role="status">
                  {restoreNote}
                </p>
              ) : null}
              <button className="btn btn--ghost" type="submit" disabled={restorePending}>
                {restorePending ? 'Checking…' : 'Restore White'}
              </button>
            </form>
          )}

          <section className="buy__card buy__soon" aria-label={STUDENT_EDITION_NAME}>
            <div className="buy__soon-head">
              <span className="belt-tip belt-tip--grey" aria-hidden="true">
                <span className="belt-tip__bar" />
              </span>
              <span>
                <span className="buy__kicker">{studentOpen ? 'Alpha' : 'Coming soon'}</span>
                <h2>{STUDENT_EDITION_NAME}</h2>
              </span>
            </div>
            <p className="buy__price">
              {formatUsdFromCents(STUDENT_LIST_PRICE_CENTS)}{' '}
              <span>USD — one-time, when it launches</span>
            </p>
            <p>
              Advantage Student Edition is a separate add-on. It does not include Advantage Coach.
              Journal notes, journal cards, and a fundamentals checklist stay on this phone.
            </p>
            {studentOpen ? null : <p>Not for sale on this page.</p>}
            {studentError ? (
              <p className="buy__status buy__status--bad" role="alert">
                {studentError}
              </p>
            ) : null}
            {studentOpen ? (
              <form onSubmit={(event) => void onStudentSubmit(event)}>
                <HalfOffCheckoutNote active={halfOff} />
                <button className="btn btn--white" type="submit" disabled={studentPending}>
                  {studentPending
                    ? 'Opening checkout…'
                    : `Continue to checkout — ${formatUsdFromCents(STUDENT_LIST_PRICE_CENTS)}`}
                </button>
              </form>
            ) : null}
            <AlphaAccessNote note={STUDENT_ALPHA_ACCESS_NOTE} />
          </section>

          <details className="buy__card buy__soon">
            <summary>
              <span className="buy__soon-head">
                <span className="belt-tip belt-tip--blue" aria-hidden="true">
                  <span className="belt-tip__bar" />
                </span>
                <span>
                  <h2>Advantage Coach</h2>
                </span>
              </span>
              <p className="buy__price">
                {formatUsdFromCents(COACH_LIST_PRICE_CENTS)}{' '}
                <span>USD — one-time, when it launches</span>
              </p>
              <span className="buy__more">See what’s included</span>
            </summary>
            <ComingSoonAd product="coach" />
          </details>

          <details className="buy__card buy__soon">
            <summary>
              <span className="buy__soon-head">
                <span className="belt-tip belt-tip--black" aria-hidden="true">
                  <span className="belt-tip__bar" />
                </span>
                <span>
                  <span className="buy__kicker">Coming soon</span>
                  <h2>Advantage Pro</h2>
                </span>
              </span>
              <p className="buy__price">
                {formatUsdFromCents(PRO_LIST_PRICE_CENTS)}{' '}
                <span>
                  {`USD — one-time, plus ${formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS)}/month, when it launches`}
                </span>
              </p>
              <span className="buy__more">See what’s included</span>
            </summary>
            <ComingSoonAd product="pro" />
          </details>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
