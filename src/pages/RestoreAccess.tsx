import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AccountReference } from '../components/AccountReference';
import { appVersionHeaders } from '../lib/appCapability';
import { rememberAccountReference } from '../lib/accountReference';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SecretField } from '../components/SecretField';
import { SiteFooter } from '../components/SiteFooter';
import { devicePublicJwk } from '../lib/deviceKey';
import { clearEntitlementToken, entitlementSnapshot, readDeviceId } from '../lib/entitlement';
import { acceptRestoredToken } from '../lib/restoreAccept';
import { clearRestoreChallenge, readRestoreChallenge, saveRestoreChallenge } from '../lib/restoreChallenge';
import { fetchRestoreCheckConfig, loadTurnstile, type RestoreCheckConfig, type TurnstileApi } from '../lib/turnstile';
import { writeExtraProfileSlots } from '../lib/studentProfiles';
import { useRestoreSession } from '../hooks/useRestoreSession';
import { requestRestoreCode, readSessionToken, sessionEmailHint } from '../lib/restorePurchase';
import { readRestoreSessionEmail, rememberRestoreSessionEmail } from '../lib/restoreSessionEmail';
import { isWhiteRestoreEmail } from '../lib/whiteUnlock';

type PersonCheck = 'loading' | 'waiting' | 'ready' | 'error' | 'off';

export type RestoreDeps = {
  fetchConfig?: () => Promise<RestoreCheckConfig>;
  loadTurnstile?: () => Promise<TurnstileApi | null>;
};

/**
 * Email me a code, then type it here and press Confirm. Code only: the email has no link.
 * The challenge id is kept for 15 minutes so the code box is still here after checking mail.
 * Old ?challenge= links still fill it in.
 */
export function RestoreAccessPage({ deps = {} }: { deps?: RestoreDeps } = {}) {
  const [params] = useSearchParams();
  const linkChallenge = params.get('challenge') ?? '';
  const [challengeId, setChallengeId] = useState(() => linkChallenge || readRestoreChallenge());
  const presetEmail = params.get('email') ?? '';
  const [email, setEmail] = useState(() => (isWhiteRestoreEmail(presetEmail) ? presetEmail.trim() : ''));
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [accountReference, setAccountReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [check, setCheck] = useState<PersonCheck>('loading');
  const [turnstileToken, setTurnstileToken] = useState('');
  const widgetHost = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const snapshot = entitlementSnapshot();
  const signedIn = useRestoreSession();
  const location = useLocation();
  const [needsEmail, setNeedsEmail] = useState(false);
  const [emailHint, setEmailHint] = useState(() => sessionEmailHint());
  const fetchConfig = deps.fetchConfig ?? fetchRestoreCheckConfig;
  const loader = deps.loadTurnstile ?? loadTurnstile;
  const showEmailField = !signedIn || needsEmail;
  const skipPersonCheck = signedIn;

  useEffect(() => {
    if (linkChallenge) saveRestoreChallenge(linkChallenge);
  }, [linkChallenge]);

  useEffect(() => {
    const state = location.state as { restoreSent?: boolean; message?: string; emailHint?: string } | null;
    if (!state?.restoreSent) return;
    if (state.message) setNote(`${state.message} Enter it below. It expires in 15 minutes.`);
    if (state.emailHint) setEmailHint(state.emailHint);
  }, [location.state]);

  useEffect(() => {
    if (signedIn) {
      setCheck('off');
      return;
    }
    let cancelled = false;
    void (async () => {
      const config = await fetchConfig();
      if (cancelled) return;
      if (!config.ok) {
        // /api/config did not load. This is not the same as a site with no key.
        setCheck('error');
        return;
      }
      if (!config.siteKey) {
        // Restore is marked available but has no public key, so the checkbox cannot run.
        setCheck(config.restoreAvailable ? 'error' : 'off');
        return;
      }
      const siteKey = config.siteKey;
      const api = await loader();
      if (cancelled) return;
      if (!api || !widgetHost.current) {
        setCheck('error');
        return;
      }
      try {
        const id = api.render(widgetHost.current, {
          sitekey: siteKey,
          theme: 'auto',
          appearance: 'always',
          action: 'restore',
          callback: (token) => {
            setTurnstileToken(token);
            setCheck('ready');
          },
          'expired-callback': () => {
            setTurnstileToken('');
            setCheck('waiting');
          },
          'timeout-callback': () => {
            setTurnstileToken('');
            setCheck('waiting');
          },
          'error-callback': () => {
            setTurnstileToken('');
            setCheck('error');
          },
        });
        widget.current = { api, id: id ?? '' };
        setCheck((current) => (current === 'loading' ? 'waiting' : current));
      } catch {
        setCheck('error');
      }
    })();
    return () => {
      cancelled = true;
      const current = widget.current;
      widget.current = null;
      try {
        if (current) current.api.remove(current.id || undefined);
      } catch {
        /* ignore */
      }
    };
    // Load once per visit. Signed-in sessions skip the widget in a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (signedIn) setCheck('off');
  }, [signedIn]);

  /** Tokens work once. Get a fresh one after every attempt. */
  const resetCheck = useCallback(() => {
    setTurnstileToken('');
    const current = widget.current;
    if (!current) return;
    setCheck('waiting');
    try {
      current.api.reset(current.id || undefined);
    } catch {
      setCheck('error');
    }
  }, []);

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setNote(null);
    if (showEmailField && !isWhiteRestoreEmail(email)) {
      setError('Enter the email from your purchase.');
      return;
    }
    if (!skipPersonCheck && check !== 'off' && !turnstileToken) {
      setError(
        check === 'error'
          ? "The person check didn't load. Refresh the page and try again."
          : 'Finish the person check above, then press Email me a code.',
      );
      return;
    }
    setPending(true);
    const result = await requestRestoreCode({
      email: showEmailField || readRestoreSessionEmail() ? (email || readRestoreSessionEmail()) : undefined,
      turnstileToken: skipPersonCheck ? undefined : turnstileToken,
      sessionToken: signedIn ? readSessionToken() : undefined,
    });
    setPending(false);
    if (!skipPersonCheck) resetCheck();
    if (!result.ok) {
      setError(result.error);
      if (result.needsEmail) setNeedsEmail(true);
      return;
    }
    if (result.challengeId) {
      saveRestoreChallenge(result.challengeId);
      setChallengeId(result.challengeId);
      setCode('');
    }
    if (result.emailHint) setEmailHint(result.emailHint);
    if (showEmailField && isWhiteRestoreEmail(email)) rememberRestoreSessionEmail(email);
    setNote(`${result.message} Enter it below. It expires in 15 minutes.`);
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
        headers: { 'content-type': 'application/json', ...appVersionHeaders() },
        body: JSON.stringify({
          challengeId,
          code: code.trim(),
          deviceId: readDeviceId(),
          publicJwk,
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        token?: string;
        error?: string;
        grants?: string[];
        accountId?: string;
        extraProfileSlots?: number;
      };
      if (!response.ok || !body.ok || !body.token) {
        setError(body.error || "That code didn't work.");
        setPending(false);
        return;
      }
      if (body.accountId) {
        rememberAccountReference(body.accountId);
        setAccountReference(body.accountId);
      }
      if (typeof body.extraProfileSlots === 'number') writeExtraProfileSlots(localStorage, body.extraProfileSlots);
      const accepted = await acceptRestoredToken(body.token);
      if (accepted) {
        if (isWhiteRestoreEmail(email)) rememberRestoreSessionEmail(email);
        clearRestoreChallenge();
        setChallengeId('');
        setCode('');
      }
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
              {signedIn && !needsEmail
                ? 'A one-time code will be emailed to the address on file for this session. Enter the code here and press Confirm. It expires in 15 minutes and works once.'
                : 'Type the email from checkout. If it matches a purchase, we email a one-time code. Enter the code here and press Confirm. It expires in 15 minutes and works once.'}
            </p>
            {signedIn && emailHint ? <p className="buy__status">We will email {emailHint}.</p> : null}
            {snapshot.message ? <p className="buy__status">{snapshot.message}</p> : null}
          </header>
          <form className="buy__card" onSubmit={(event) => void onRequest(event)}>
            {showEmailField ? (
              <label className="buy__field">
                <span>Purchase email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            ) : null}
            {skipPersonCheck ? null : <div className="restore__turnstile" ref={widgetHost} data-testid="turnstile" />}
            {!skipPersonCheck && check === 'off' ? (
              <p className="buy__status" role="status">
                The person check is not set up on this site yet, so a code may not send. Try again later.
              </p>
            ) : null}
            {!skipPersonCheck && check === 'error' ? (
              <p className="buy__status buy__status--bad" role="alert">
                The person check didn't load. Refresh the page and try again.
              </p>
            ) : null}
            <button
              className="btn btn--white"
              type="submit"
              disabled={pending || (!skipPersonCheck && (check === 'loading' || check === 'error'))}
            >
              {pending ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
          {challengeId ? (
            <form className="buy__card" onSubmit={(event) => void onConfirm(event)}>
              <SecretField
                label="Code from the email"
                name="code"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={setCode}
              />
              <button className="btn btn--white" type="submit" disabled={pending}>
                Confirm
              </button>
            </form>
          ) : null}
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
          <AccountReference id={accountReference} />
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
