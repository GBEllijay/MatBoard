import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CloudAddonChoice, CloudAddonLine, InstructorCloudCopy } from '../components/CloudAddon';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { UpgradeQuote } from '../components/UpgradeQuote';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useMediaUnlocked } from '../hooks/useMediaUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import type { CheckoutProduct } from '../lib/checkoutProducts';
import { confirmCheckoutSession, withCheckoutNonce } from '../lib/codeRedeemClient';
import { LEARN_MORE } from '../lib/learnMore';
import { PRO_PRODUCT_ID, proPurchaseEntitled } from '../lib/proEntitlement';
import { setProUnlocked } from '../lib/proUnlock';
import {
  PRO_LIST_PRICE_CENTS,
  STUDENT_LIST_PRICE_CENTS,
} from '../lib/productPrices';
import { COACH_UNLIMITED_PATH, INSTRUCTOR_HOME_TITLE, PRODUCTS_PATH, STUDENT_EDITION_NAME } from '../lib/productNames';
import { INSTRUCTOR_DISPLAY_PRICE_CENTS, TIER_BUY_PATHS } from '../lib/tierBuyPages';
import { rememberStudentPurchase, STUDENT_PRODUCT_ID, studentEditionEntitled } from '../lib/studentEdition';
import { buyCheckoutBody } from '../lib/halfOff';
import { MEDIA_EDITION_LIST_PRICE_CENTS, MEDIA_EDITION_NAME } from '../lib/mediaEdition';
import { readKnownPurchaseEmail } from '../lib/editionLadder';
import { upgradeButtonPrice, type UpgradeQuoteResult } from '../lib/upgradeQuoteClient';
import type { WhiteEntitlementStatus } from '../lib/whiteEntitlementClient';
import { formatUsdFromCents, WHITE_CHECKOUT_API, WHITE_STRIPE_NOTE } from '../lib/whitePurchase';

// Coach checkout charges STRIPE_PRICE_INSTRUCTOR and refuses to start unless that price is this amount.
const COACH_PRICE = formatUsdFromCents(INSTRUCTOR_DISPLAY_PRICE_CENTS);
const MEDIA_PRICE = formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS);
const PRO_PRICE = formatUsdFromCents(PRO_LIST_PRICE_CENTS);
const STUDENT_PRICE = formatUsdFromCents(STUDENT_LIST_PRICE_CENTS);

type TierCopy = {
  product: Extract<CheckoutProduct, 'student' | 'coach' | 'pro' | 'media'>;
  title: string;
  priceLabel: string;
  priceDetail: string;
  buttonPrice: string;
  belt: 'grey' | 'blue' | 'brown' | 'black' | 'purple';
  /** Public "what's included" page for this tier, when it has one. */
  infoPath?: string;
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
    // Display name only. The checkout product, entitlement key and Stripe price stay "coach".
    title: INSTRUCTOR_HOME_TITLE,
    priceLabel: COACH_PRICE,
    priceDetail: 'USD — One Time Purchase',
    buttonPrice: COACH_PRICE,
    belt: 'brown',
    theme: 'coach',
    // Owner 2026-11-01: the Instructor open link goes to Coach Unlimited (route and gate unchanged).
    openPath: COACH_UNLIMITED_PATH,
    openLabel: 'Open Instructor Edition',
    infoPath: TIER_BUY_PATHS.instructor,
  },
  pro: {
    product: 'pro',
    title: 'Advantage Pro',
    priceLabel: PRO_PRICE,
    priceDetail: 'USD — One Time Purchase',
    buttonPrice: PRO_PRICE,
    belt: 'black',
    theme: 'pro',
    openPath: '/pro',
    openLabel: 'Open Pro',
  },
  media: {
    product: 'media',
    title: MEDIA_EDITION_NAME,
    priceLabel: MEDIA_PRICE,
    priceDetail: 'USD — One Time Purchase',
    buttonPrice: MEDIA_PRICE,
    belt: 'purple',
    theme: 'white',
    openPath: '/media',
    openLabel: 'Open Media Edition',
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
  const mediaDoor = useMediaUnlocked();
  const [upgradeEmail, setUpgradeEmail] = useState(() => readKnownPurchaseEmail(params.toString()) ?? '');
  const [includeCloud, setIncludeCloud] = useState(false);
  const cloudTier = tier.product === 'media' || tier.product === 'coach' || tier.product === 'pro';
  const [quote, setQuote] = useState<UpgradeQuoteResult | null>(null);
  const showCheckout =
    tier.product === 'pro'
      ? proUnlocked
      : tier.product === 'student'
        ? studentDoor
        : tier.product === 'media'
          ? mediaDoor || proUnlocked
          : true;
  const upgradePrice = upgradeButtonPrice(quote);
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
    if (tier.product !== 'student' && tier.product !== 'pro' && tier.product !== 'coach' && tier.product !== 'media') return;
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
        (tier.product === 'pro'
          ? PRO_PRODUCT_ID
          : tier.product === 'student'
            ? STUDENT_PRODUCT_ID
            : tier.product === 'media'
              ? 'advantage-media'
              : 'advantage-coach');
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
        body: JSON.stringify(
          await withCheckoutNonce({
            ...buyCheckoutBody({ product: tier.product, halfOffActive: halfOff, cloud: cloudTier && includeCloud }),
            ...(upgradeEmail.trim() ? { email: upgradeEmail.trim() } : {}),
          }),
        ),
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
            {cloudTier ? <CloudAddonLine /> : null}
            {tier.product === 'coach' ? <InstructorCloudCopy /> : null}
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
                      : tier.product === 'media'
                        ? record?.entitled
                          ? `${MEDIA_EDITION_NAME} is unlocked on this device.`
                          : "That payment isn't confirmed. Nothing was unlocked."
                        : record?.entitled
                        ? `${INSTRUCTOR_HOME_TITLE} is unlocked on this device.`
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
              <UpgradeQuote
                tier={tier.product}
                halfOff={halfOff}
                email={upgradeEmail}
                onEmailChange={setUpgradeEmail}
                quote={quote}
                onQuote={setQuote}
              />
            ) : null}
            {showCheckout && cloudTier ? <CloudAddonChoice checked={includeCloud} onChange={setIncludeCloud} /> : null}
            {showCheckout ? (
              <button className="btn btn--white" type="submit" disabled={pending || quote?.kind === 'owned'}>
                {pending
                  ? 'Opening checkout…'
                  : upgradePrice
                    ? `Upgrade for ${upgradePrice}`
                    : `Continue to checkout — ${tier.buttonPrice}`}
              </button>
            ) : null}
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={openPath}>{tier.openLabel}</Link>
              {tier.infoPath ? (
                <>
                  {' · '}
                  <Link to={tier.infoPath}>{LEARN_MORE.instructor.label}</Link>
                </>
              ) : null}
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

export function BuyMediaPage() {
  return <BuyTierPage tier={TIERS.media} />;
}
