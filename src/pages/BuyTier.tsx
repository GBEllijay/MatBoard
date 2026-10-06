import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { useProUnlocked } from '../hooks/useProUnlocked';
import type { CheckoutProduct } from '../lib/checkoutProducts';
import { PRO_PRODUCT_ID, proDeviceUnlock, proPurchaseEntitled } from '../lib/proEntitlement';
import { setProUnlocked } from '../lib/proUnlock';
import { COACH_LIST_PRICE_CENTS, PRO_LIST_PRICE_CENTS, PRO_MONTHLY_PRICE_CENTS } from '../lib/productPrices';
import { lookupWhiteEntitlement, type WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import { formatUsdFromCents, WHITE_CHECKOUT_API, WHITE_STRIPE_NOTE } from '../lib/whitePurchase';

const COACH_PRICE = formatUsdFromCents(COACH_LIST_PRICE_CENTS);
const PRO_PRICE = formatUsdFromCents(PRO_LIST_PRICE_CENTS);
const PRO_MONTHLY = formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS);

type TierCopy = {
  product: Extract<CheckoutProduct, 'coach' | 'pro'>;
  title: string;
  priceLabel: string;
  priceDetail: string;
  buttonPrice: string;
  belt: 'blue' | 'black';
  theme: 'coach' | 'pro';
  openPath: string;
  openLabel: string;
};

const TIERS: Record<TierCopy['product'], TierCopy> = {
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
  const proUnlocked = useProUnlocked();
  const showCheckout = tier.product !== 'pro' || proUnlocked;

  useEffect(() => {
    const previous = document.title;
    document.title = `Buy ${tier.title}`;
    return () => {
      document.title = previous;
    };
  }, [tier.title]);

  useEffect(() => {
    if (tier.product !== 'pro' || checkout !== 'success' || !sessionId) return;
    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const tick = async () => {
      const status = await lookupWhiteEntitlement({ sessionId });
      const deviceUnlock = proDeviceUnlock(status);
      if (deviceUnlock !== null) setProUnlocked(deviceUnlock);
      if (cancelled) return;
      attempts += 1;
      if (deviceUnlock !== null || attempts >= 4) {
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
        body: JSON.stringify({ product: tier.product }),
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
        <HomeMark to="/" />
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
            {checkout === 'success' ? (
              <p className="buy__status buy__status--ok" role="status">
                {tier.product === 'pro'
                  ? record && proPurchaseEntitled(record)
                    ? `Advantage Pro is unlocked${record.email ? ` for ${record.email}` : ''}.`
                    : record?.product === PRO_PRODUCT_ID
                      ? 'This Advantage Pro subscription is not active.'
                      : 'Payment submitted. Advantage unlocks Pro when Stripe confirms the subscription.'
                  : 'Payment submitted. Stripe Checkout is complete.'}
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
              <Link to={tier.openPath}>{tier.openLabel}</Link>
            </p>
          </form>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

export function BuyCoachPage() {
  return <BuyTierPage tier={TIERS.coach} />;
}

export function BuyProPage() {
  return <BuyTierPage tier={TIERS.pro} />;
}
