import { useState } from 'react';
import {
  PURCHASE_CREDIT_NOTE,
  requestUpgradeQuote,
  upgradeQuoteNote,
  type UpgradeQuoteResult,
  type UpgradeTier,
} from '../lib/upgradeQuoteClient';

/**
 * Optional purchase-email field on a tier checkout. With an email the server credits what
 * that email already paid for a lower tier. Leaving it blank keeps the normal checkout.
 */
export function UpgradeQuote({
  tier,
  halfOff,
  email,
  onEmailChange,
  quote,
  onQuote,
}: {
  tier: UpgradeTier;
  halfOff: boolean;
  email: string;
  onEmailChange: (email: string) => void;
  quote: UpgradeQuoteResult | null;
  onQuote: (quote: UpgradeQuoteResult | null) => void;
}) {
  const [checking, setChecking] = useState(false);
  const note = upgradeQuoteNote(quote);

  async function check() {
    const trimmed = email.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    onQuote(await requestUpgradeQuote({ tier, email: trimmed, halfOff }));
    setChecking(false);
  }

  return (
    <div className="buy__upgrade" data-testid="upgrade-quote">
      <p className="buy__credit-note" data-testid="purchase-credit-note">
        {PURCHASE_CREDIT_NOTE}
      </p>
      <label className="buy__field">
        <span>Already bought an edition? Purchase email (optional)</span>
        <input
          type="email"
          name="upgradeEmail"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            onEmailChange(event.target.value);
            onQuote(null);
          }}
          onBlur={() => void check()}
        />
      </label>
      <button className="btn" type="button" disabled={checking || !email.trim()} onClick={() => void check()}>
        {checking ? 'Checking…' : 'Check upgrade price'}
      </button>
      {note ? (
        <p className={`buy__status${quote?.kind === 'quote' ? ' buy__status--ok' : ''}`} role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
