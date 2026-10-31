import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { devicePublicJwk } from '../lib/deviceKey';
import { clearEntitlementToken, entitlementSnapshot, readDeviceId } from '../lib/entitlement';
import { acceptRestoredToken } from '../lib/restoreAccept';
import { isWhiteRestoreEmail, restoreWhiteByEmail } from '../lib/whiteUnlock';

/**
 * Confirm button posts the code. Opening the link does not spend it.
 */
export function RestoreAccessPage() {
  const [params] = useSearchParams();
  const challengeId = params.get('challenge') ?? '';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const snapshot = entitlementSnapshot();

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNote(null);
    if (!isWhiteRestoreEmail(email)) {
      setError('Enter the email from your purchase.');
      return;
    }
    setPending(true);
    const result = await restoreWhiteByEmail(email);
    setPending(false);
    if (!result.ok) setError(result.error);
    else setNote(result.message);
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNote(null);
    if (!challengeId || !code.trim()) {
      setError("That code didn't work.");
      return;
    }
    setPending(true);
    try {
      const publicJwk = await devicePublicJwk();
      const response = await fetch('/api/restore/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: code.trim(),
          deviceId: readDeviceId(),
          publicJwk,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; token?: string; error?: string; grants?: string[] };
      if (!response.ok || !body.ok || !body.token) {
        setError(body.error || "That code didn't work.");
        setPending(false);
        return;
      }
      const accepted = await acceptRestoredToken(body.token);
      setNote(accepted ? 'This device is restored.' : "That code didn't work.");
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setPending(false);
  }

  async function onSignOutOthers() {
    setError(null);
    let token = '';
    try {
      token = localStorage.getItem('advantage.entitlement.token') ?? '';
    } catch {
      token = '';
    }
    if (!token) {
      setError('Restore on this device first, then you can sign out the others.');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/devices/revoke-others', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; signedOut?: number };
      if (!response.ok || !body.ok) setError(body.error || 'Could not sign out the other devices.');
      else setNote(`Signed out ${body.signedOut ?? 0} other device${body.signedOut === 1 ? '' : 's'}.`);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
    setPending(false);
  }

  return (
    <main className="home">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy">
          <header className="buy__card">
            <h2>Restore a purchase</h2>
            <p>
              Type the email from checkout. If it matches, we send a code and a link. The link opens this page. Press
              Confirm so a mail scanner cannot use the code first.
            </p>
            {snapshot.message ? <p className="buy__status">{snapshot.message}</p> : null}
          </header>
          <form className="buy__card" onSubmit={(event) => void onRequest(event)}>
            <label className="buy__field">
              <span>Purchase email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button className="btn btn--white" type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
          <form className="buy__card" onSubmit={(event) => void onConfirm(event)}>
            <label className="buy__field">
              <span>Code from the email</span>
              <input
                name="code"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button className="btn btn--white" type="submit" disabled={pending || !challengeId}>
              Confirm
            </button>
            {!challengeId ? <p>Open the link in the email so this page can confirm the code.</p> : null}
          </form>
          {error ? (
            <p className="buy__status buy__status--bad" role="alert">
              {error}
            </p>
          ) : null}
          {note ? (
            <p className="buy__status buy__status--ok" role="status">
              {note}
            </p>
          ) : null}
          <p>
            <button className="btn btn--ghost" type="button" onClick={() => void onSignOutOthers()} disabled={pending}>
              Sign out other devices
            </button>
          </p>
          <p>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                clearEntitlementToken();
                setNote('Cleared the token on this device.');
              }}
            >
              Clear this device
            </button>
          </p>
          <p>
            <Link to="/buy">Back to checkout</Link>
          </p>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
