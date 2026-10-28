import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import type { CheckoutProduct } from '../lib/checkoutProducts';
import { confirmCheckoutSession, withCheckoutNonce } from '../lib/codeRedeemClient';
import { PRO_PRODUCT_ID, proPurchaseEntitled } from '../lib/proEntitlement';
import { setProUnlocked } from '../lib/proUnlock';
import {
  COACH_LIST_PRICE_CENTS,
  PRO_LIST_PRICE_CENTS,
  PRO_MONTHLY_PRICE_CENTS,
  STUDENT_LIST_PRICE_CENTS,
} from '../lib/productPrices';
import { PRODUCTS_PATH, STUDENT_EDITION_NAME } from '../lib/productNames';
import { rememberStudentPurchase, STUDENT_PRODUCT_ID, studentEditionEntitled } from '../lib/studentEdition';
import { buyCheckoutBody } from '../lib/halfOff';
import type { WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import { formatUsdFromCents, WHITE_CHECKOUT_API, WHITE_STRIPE_NOTE } from '../lib/whitePurchase';

const COACH_PRICE = formatUsdFromCents(COACH_LIST_PRICE_CENTS);
const PRO_PRICE = formatUsdFromCents(PRO_LIST_PRICE_CENTS);
const PRO_MONTHLY = formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS);
const STUDENT_PRICE = formatUsdFromCents(STUDENT_LIST_PRICE_CENTS);

type TierCopy = {
  product: Extract<CheckoutProduct, 'student' | 'coach' | 'pro'>;
  title: string;
  priceLabel: string;
  priceDetail: string;
  buttonPrice: string;
  belt: 'grey' | 'blue' | 'black';
  theme: 'white' | 'coach' | 'pro';
  openPath: string;
  openLabel: string;
};

const TIERS: Record<TierCopy['product'], TierCopy> = {
  student: {
    product: 'student',
    title: STUDENT_EDITION_NAME,
    priceLabel: STUDENT_PRICE,
    priceDetail: 'USD — One Time Purchase',
    buttonPrice: STUDENT_PRICE,
    belt: 'grey',
    theme: 'white',
    openPath: '/student',
    openLabel: 'Open Student Edition',
  },
  coach: {
    product: 'coach',
    title: 'Advantage Coach',
    priceLabel: COACH_PRICE,
    priceDetail: 'USD — One Time Purchase',
    buttonPrice: COACH_PRICE,
    belt: 'blue',
    theme: 'coach',
    openPath: '/coach',
    openLabel: 'Open Coach',
  },
  pro: {
    product: 'pro',
    title: 'Advantage Pro',
    priceLabel: PRO_PRICE,
    priceDetail: `USD — One Time Purchase, plus ${PRO_MONTHLY}/month`,
    buttonPrice: `${PRO_PRICE} + ${PRO_MONTHLY}/month`,
    belt: 'black',
    theme: 'pro',
    openPath: '/pro',
    openLabel: 'Open Pro',
  },
};

function BuyTierPage({ tier }: { tier: TierCopy }) {
  const [params] = useSearchParams();
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<WhiteEntitlementStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const halfOff = useHalfOffArrival();
  const proUnlocked = useProUnlocked();
  const studentDoor = studentEditionEntitled({
    pro: proUnlocked,
    coach: useCoachUnlocked(),
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
  });
  const showCheckout = tier.product === 'pro' ? proUnlocked : tier.product === 'student' ? studentDoor : true;
  const openPath = tier.product === 'student' && params.get('student') === '1' ? '/student?student=1' : tier.openPath;

  useEffect(() => {
    const previous = document.title;
    document.title = `Buy ${tier.title}`;
    return () => {
      document.title = previous;
    };
  }, [tier.title]);

  useEffect(() => {
    if (checkout !== 'success' || !sessionId) return;
    if (tier.product !== 'student' && tier.product !== 'pro' && tier.product !== 'coach') return;
    let cancelled = false;
    setConfirming(true);
    void confirmCheckoutSession(sessionId).then((result) => {
      if (cancelled) return;
      setConfirming(false);
      if (!result.ok) {
        setRecord({ entitled: false, product: tier.product === 'pro' ? PRO_PRODUCT_ID : STUDENT_PRODUCT_ID });
        setError(result.error);
        return;
      }
      const product =
        result.product ??
        (tier.product === 'pro' ? PRO_PRODUCT_ID : tier.product === 'student' ? STUDENT_PRODUCT_ID : 'advantage-coach');
      const status = { entitled: true, product, grants: result.grants };
      if (tier.product === 'student') rememberStudentPurchase(status);
      if (tier.product === 'pro' && result.grants.includes('pro')) setProUnlocked(true);
      if (tier.product === 'coach' && result.grants.includes('coach')) {
        /* Coach checkout confirm sets the flag inside applyServerGrant. */
      }
      setRecord(status);
    });
    return () => {
      cancelled = true;
    };
  }, [checkout, sessionId, tier.product]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(await withCheckoutNonce(buyCheckoutBody({ product: tier.product, halfOffActive: halfOff }))),
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
    <main className={`home home--${tier.theme}`}>
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />
        <article className="buy">
          <header className="buy__card">
            <span className={`belt-tip belt-tip--${tier.belt}`} aria-hidden="true">
              <span className="belt-tip__bar" />
            </span>
            <h2>{tier.title}</h2>
            <p className="buy__price">
              {tier.priceLabel} <span>{tier.priceDetail}</span>
            </p>
            <p>{WHITE_STRIPE_NOTE}</p>
          </header>

          <form className="buy__card" onSubmit={(event) => void onSubmit(event)}>
            <HalfOffCheckoutNote active={halfOff} />
            {checkout === 'success' ? (
              <p className="buy__status buy__status--ok" role="status">
                {confirming
                  ? 'Confirming that payment with Stripe.'
                  : tier.product === 'pro'
                    ? record && proPurchaseEntitled(record)
                      ? 'Advantage Pro is unlocked on this device.'
                      : "That payment isn't confirmed. Nothing was unlocked."
                    : tier.product === 'student'
                      ? record?.entitled && record.product === STUDENT_PRODUCT_ID
                        ? 'Advantage Student Edition is unlocked on this device.'
                        : "That payment isn't confirmed. Nothing was unlocked."
                      : record?.entitled
                        ? 'Advantage Coach is unlocked on this device.'
                        : "That payment isn't confirmed. Nothing was unlocked."}
              </p>
            ) : null}
            {checkout === 'cancel' ? (
              <p className="buy__status" role="status">
                Checkout canceled. No charge was made.
              </p>
            ) : null}
            {error ? (
              <p className="buy__status buy__status--bad" role="alert">
                {error}
              </p>
            ) : null}
            {showCheckout ? (
              <button className="btn btn--white" type="submit" disabled={pending}>
                {pending ? 'Opening checkout…' : `Continue to checkout — ${tier.buttonPrice}`}
              </button>
            ) : null}
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={openPath}>{tier.openLabel}</Link>
            </p>
          </form>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

export function BuyStudentPage() {
  return <BuyTierPage tier={TIERS.student} />;
}

export function BuyCoachPage() {
  return <BuyTierPage tier={TIERS.coach} />;
}

export function BuyProPage() {
  return <BuyTierPage tier={TIERS.pro} />;
}
