import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  WHITE_IAP_PLACEHOLDER_PRODUCT_ID,
  WHITE_IAP_PRICE_LABEL,
  nativeWhiteIapStub,
} from '../lib/nativeWhiteIap';

/**
 * Native White unlock screen. Replaces `/buy` Stripe checkout in the
 * Capacitor build. Buttons call the StoreKit stub and never POST
 * `/api/checkout` or `/api/restore/request`.
 */
export function NativeWhiteUnlockPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<'buy' | 'restore' | null>(null);

  async function onPurchase() {
    if (pending) return;
    setPending('buy');
    setMessage(null);
    const result = await nativeWhiteIapStub.purchaseWhiteUnlock();
    setMessage(result.ok ? 'Advantage White is unlocked on this device.' : result.error);
    setPending(null);
  }

  async function onRestore() {
    if (pending) return;
    setPending('restore');
    setMessage(null);
    const result = await nativeWhiteIapStub.restoreWhitePurchases();
    setMessage(
      result.ok
        ? result.unlocked
          ? 'Purchases restored. Advantage White is unlocked on this device.'
          : 'No previous purchase was found for this Apple ID.'
        : result.error,
    );
    setPending(null);
  }

  return (
    <main className="home home--white home--buy">
      <div className="home__inner">
        <HomeMark to="/white" />
        <article className="buy">
          <header className="buy__card buy__card--belt">
            <span className="belt-tip belt-tip--white buy__belt" aria-hidden="true">
              <span className="belt-tip__bar" />
            </span>
            <p className="buy__kicker">Advantage White</p>
            <h2>Unlock everything in White</h2>
            <p className="buy__price">
              {WHITE_IAP_PRICE_LABEL} <span>USD — One Time Purchase</span>
            </p>
            <p>
              The round timer is always free. You also get one free scoreboard match and one free
              mock tournament. This purchase unlocks the scoreboard, brackets, Bracket Roster, and
              all skins in Advantage White. Other editions are sold separately.
            </p>
          </header>

          <section className="buy__card buy__checkout" aria-label="In-app purchase">
            {message ? (
              <p className="buy__status" role="status">
                {message}
              </p>
            ) : (
              <p className="buy__hint">
                In-app purchase is not wired yet. These buttons are ready for StoreKit and do not
                open a web checkout.
              </p>
            )}
            <button
              className="btn btn--white"
              type="button"
              onClick={() => void onPurchase()}
              disabled={pending !== null}
            >
              {pending === 'buy' ? 'Starting purchase…' : `Unlock White — ${WHITE_IAP_PRICE_LABEL}`}
            </button>
            <button
              className="btn btn--white"
              type="button"
              onClick={() => void onRestore()}
              disabled={pending !== null}
            >
              {pending === 'restore' ? 'Restoring…' : 'Restore Purchases'}
            </button>
            <p className="buy__hint">Product id (placeholder): {WHITE_IAP_PLACEHOLDER_PRODUCT_ID}</p>
            <p>
              <Link to="/white">Back to White</Link>
              {' · '}
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
            </p>
          </section>
        </article>
        <SiteFooter hideAccount />
      </div>
    </main>
  );
}
