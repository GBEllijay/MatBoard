import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlphaCodeEntry, redeemAlphaCode } from '../components/AlphaCodeEntry';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { HigherTierList, ProCloudBuyCard } from '../components/TierBuyParts';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { confirmCheckoutSession, withCheckoutNonce } from '../lib/codeRedeemClient';
import type { WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import { STUDENT_LIST_PRICE_CENTS, WHITE_STORAGE_LINE } from '../lib/productPrices';
import { PRODUCTS_PATH } from '../lib/productNames';
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
import { rememberWhitePurchase, restoreHref } from '../lib/whiteUnlock';

/** The /buy restore panel. The email and the person check live on /restore. */
export const BUY_RESTORE_COPY =
  'Already purchased? Enter the email from checkout. If it matches the purchase, we will email a one-time code.';

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
  const [accessEmail, setAccessEmail] = useState('');
  const navigate = useNavigate();
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
    void redeemAlphaCode({ tier: 'white', code, email: accessEmail, navigate }).then((result) => {
      if (!active) return;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('code');
          return next;
        },
        { replace: true },
      );
      if (result.status === 'unlocked') {
        setFreeUnlock(true);
        return;
      }
      if (result.status === 'error') {
        setPromoInput(code);
        setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [code, setParams]);

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

  async function startCheckout(typed: string) {
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

  async function onCheckoutClick() {
    if (pending) return;
    setError(null);
    const typed = promoInput.trim();
    if (unlocked && !typed) return;
    if (typed) {
      setPending(true);
      const result = await redeemAlphaCode({
        tier: 'white',
        code: typed,
        email: accessEmail,
        navigate,
        onPromoCheckout: startCheckout,
      });
      if (result.status === 'error') setError(result.error);
      if (result.status === 'unlocked') setPromoInput('');
      if (result.status !== 'checkout') setPending(false);
      return;
    }
    await startCheckout('');
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
            <p className="buy__storage">{WHITE_STORAGE_LINE}</p>
          </header>

          <section className="buy__card buy__checkout" aria-label="Checkout">
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
            <AlphaCodeEntry
              tier="white"
              showEmail
              email={accessEmail}
              onEmailChange={setAccessEmail}
              code={promoInput}
              onCodeChange={setPromoInput}
              codeId="promotion-code"
              codeName="promotionCode"
              codeLabel="Unlock or promo code"
              onPromoCheckout={startCheckout}
            />
            <p className="buy__hint">
              Optional. An unlock code opens Advantage White on this device. A promo code applies at Stripe checkout.
            </p>
            {unlocked ? (
              <Link className="btn btn--white" to="/white">
                Open White
              </Link>
            ) : null}
            {!unlocked || promoInput.trim() ? (
              <button className="btn btn--white" type="button" onClick={() => void onCheckoutClick()} disabled={pending}>
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
          </section>

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
            <section className="buy__card buy__restore" aria-label="Already purchased">
              <p>{BUY_RESTORE_COPY}</p>
              <button className="btn btn--white" type="button" onClick={() => navigate(restoreHref(accessEmail))}>
                Restore
              </button>
            </section>
          )}

          {/* Higher tiers in ladder order: Student, Media, Instructor Edition, Pro. */}
          <HigherTierList
            from="white"
            kickers={{ student: studentOpen ? 'Alpha' : 'This product is in alpha' }}
            extras={{
              student: (
                <>
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
                </>
              ),
            }}
          />
          <ProCloudBuyCard />
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
