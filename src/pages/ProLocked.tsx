import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { ENTITLEMENT_TOKEN_KEY, entitlementSnapshot, proAccessPaused } from '../lib/entitlement';
import { refreshEntitlement } from '../lib/entitlementRefresh';
import { downloadLockedData } from '../lib/lockedExport';

function readToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Pro is paused. Nothing on this device is deleted. */
export function ProLockedPage() {
  const snapshot = entitlementSnapshot();
  const seat = snapshot.claims?.tier === 'seat' || snapshot.claims?.src === 'seat';
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function updatePayment() {
    setPending(true);
    setNote(null);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: readToken(), returnUrl: window.location.href }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setNote(body.error || 'Billing could not be opened.');
        setPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setNote('Could not reach the server. Check your connection and try again.');
      setPending(false);
    }
  }

  async function refreshPaid() {
    setPending(true);
    setNote(null);
    const ok = await refreshEntitlement();
    setPending(false);
    if (ok && !proAccessPaused()) setNote('Pro is open again.');
    else setNote(ok ? 'Pro is still paused.' : 'Could not refresh yet. Try again when you are online.');
  }

  return (
    <main className="home">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy">
          <header className="buy__card">
            <h2>Pro is paused: your data is safe</h2>
            {seat ? (
              <p>Ask your gym owner to check billing. Your photos, notes, and cloud folder stay on this device.</p>
            ) : (
              <p>Your payment did not go through. Photos, notes, and your cloud folder are still on this device.</p>
            )}
          </header>
          {seat ? null : (
            <p>
              <button className="btn btn--white" type="button" onClick={() => void updatePayment()} disabled={pending}>
                Update payment
              </button>
            </p>
          )}
          <p>
            <button className="btn btn--ghost" type="button" onClick={() => void refreshPaid()} disabled={pending}>
              I've paid, refresh
            </button>
          </p>
          <p>
            <Link to="/restore">Restore</Link>
          </p>
          <p>
            <button className="btn btn--ghost" type="button" onClick={() => downloadLockedData()}>
              Export my data
            </button>
          </p>
          {note ? (
            <p className="buy__status" role="status">
              {note}
            </p>
          ) : null}
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
