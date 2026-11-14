import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SecretField } from '../components/SecretField';
import { SignOutButton } from '../components/SignOutButton';
import { SiteFooter } from '../components/SiteFooter';
import {
  fetchAccount,
  firstSignInWithInvite,
  setPasswordWithEmailCode,
  signInWithPassword,
  type AccountProfile,
  type InviteGrant,
  type LoginPayload,
  type LoginResult,
} from '../lib/emailLogin';
import { INSTRUCTOR_PERMISSION_FIELDS, instructorPreset, normalizeInstructorPresetId } from '../lib/instructorSeats';
import { fetchRestoreCheckConfig, loadTurnstile, type TurnstileApi } from '../lib/turnstile';
import { isWhiteRestoreEmail, restoreWhiteByEmail } from '../lib/whiteUnlock';

const EDITION_LABELS: Record<string, string> = {
  white: 'Advantage White',
  student: 'Student Edition',
  coach: 'Instructor Edition',
  media: 'Media Edition',
  pro: 'Advantage Pro',
};

const EDITION_PATHS: Record<string, string> = {
  white: '/white',
  student: '/student',
  coach: '/coach',
  media: '/media',
  pro: '/pro',
};

const PRODUCT_LABELS: Record<string, string> = {
  'advantage-white': 'Advantage White',
  'advantage-student': 'Student Edition',
  'advantage-coach': 'Instructor Edition',
  'advantage-media': 'Media Edition',
  'advantage-pro': 'Advantage Pro',
};

const SOURCE_LABELS: Record<string, string> = {
  stripe_payment: 'Purchased',
  stripe_subscription: 'Subscription',
  free: 'Invite',
  code: 'Code',
  owner: 'Owner',
};

const MIN_PASSWORD = 8;

type Mode = 'signin' | 'invite' | 'code';

function editionName(door: string): string {
  return EDITION_LABELS[door] ?? door;
}

function dateText(iso: string | null | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

/** Turnstile person check for the email-code step. Same setup as /restore. */
function usePersonCheck(active: boolean) {
  const host = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const [state, setState] = useState<'loading' | 'waiting' | 'ready' | 'error' | 'off'>('loading');
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const config = await fetchRestoreCheckConfig();
      if (cancelled) return;
      if (!config.ok) return setState('error');
      if (!config.siteKey) return setState(config.restoreAvailable ? 'error' : 'off');
      const api = await loadTurnstile();
      if (cancelled) return;
      if (!api || !host.current) return setState('error');
      try {
        const id = api.render(host.current, {
          sitekey: config.siteKey,
          theme: 'auto',
          appearance: 'always',
          action: 'restore',
          callback: (value) => {
            setToken(value);
            setState('ready');
          },
          'expired-callback': () => {
            setToken('');
            setState('waiting');
          },
          'timeout-callback': () => {
            setToken('');
            setState('waiting');
          },
          'error-callback': () => {
            setToken('');
            setState('error');
          },
        });
        widget.current = { api, id: id ?? '' };
        setState((current) => (current === 'loading' ? 'waiting' : current));
      } catch {
        setState('error');
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
  }, [active]);
  const reset = useCallback(() => {
    setToken('');
    const current = widget.current;
    if (!current) return;
    setState('waiting');
    try {
      current.api.reset(current.id || undefined);
    } catch {
      setState('error');
    }
  }, []);
  return { host, state, token, reset };
}

function InviteAccess({ invite }: { invite: InviteGrant }) {
  const presetId = normalizeInstructorPresetId(invite.preset);
  const role = invite.kind === 'seat' ? (presetId ? instructorPreset(presetId).label : 'Instructor seat') : 'Student Edition invite';
  const on = INSTRUCTOR_PERMISSION_FIELDS.filter((field) => invite.features[field.key] === true);
  const off = INSTRUCTOR_PERMISSION_FIELDS.filter((field) => invite.features[field.key] === false);
  return (
    <section className="buy__card account__invite" aria-label="Access from your instructor">
      <h3>{invite.gymName ? `${invite.gymName}` : 'Your academy'}</h3>
      <p>
        {role}
        {invite.issuer ? ` · from ${invite.issuer.toLowerCase() === 'gym owner' ? 'the gym owner' : 'your instructor'}` : ''}
        {invite.redeemedAt ? ` · since ${dateText(invite.redeemedAt)}` : ''}
      </p>
      <p className={invite.active ? 'buy__status buy__status--ok' : 'buy__status buy__status--bad'}>
        {invite.active ? 'Active. Connected to this academy on every sign-in.' : 'This invite was revoked. Its access is closed.'}
      </p>
      <p>
        <strong>Editions:</strong> {invite.editions.map(editionName).join(', ') || 'None'}
      </p>
      {invite.kind === 'seat' ? (
        on.length || off.length ? (
          <ul className="account__features">
            {INSTRUCTOR_PERMISSION_FIELDS.map((field) =>
              typeof invite.features[field.key] === 'boolean' ? (
                <li key={field.key}>
                  {invite.features[field.key] ? '✓' : '—'} {field.label}
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p>The academy owner has not saved switches for this seat yet. Its role&apos;s menus apply.</p>
        )
      ) : null}
    </section>
  );
}

function Profile({ payload, onRefresh, busy }: { payload: LoginPayload; onRefresh: () => void; busy: boolean }) {
  const profile: AccountProfile = payload.profile;
  const grants = profile.license?.grants ?? [];
  return (
    <>
      <header className="buy__card">
        <h2>Your account</h2>
        <p>
          Signed in as <strong>{profile.email}</strong>. This browser stays signed in until you sign out
          {payload.sessionExpiresAt ? ` (or until ${dateText(payload.sessionExpiresAt)} without a visit)` : ''}.
        </p>
        {payload.warning ? <p className="buy__status buy__status--bad">{payload.warning}</p> : null}
      </header>
      <section className="buy__card" aria-label="Editions you own">
        <h3>Your editions</h3>
        {profile.editions.length ? (
          <ul className="account__editions">
            {profile.editions.map((door) => (
              <li key={door}>
                <Link to={EDITION_PATHS[door] ?? '/products'}>Open {editionName(door)}</Link>
              </li>
            ))}
          </ul>
        ) : payload.seat ? (
          <p>Your access comes from your instructor seat below.</p>
        ) : (
          <p>No editions are on this email yet.</p>
        )}
      </section>
      <section className="buy__card" aria-label="License status">
        <h3>License status</h3>
        {grants.length ? (
          <ul>
            {grants.map((grant, index) => (
              <li key={`${grant.product}-${index}`}>
                {PRODUCT_LABELS[grant.product] ?? grant.product} · {SOURCE_LABELS[grant.source] ?? grant.source} ·{' '}
                {grant.status === 'active' ? 'Active' : grant.status}
                {grant.endsAt ? ` · ends ${dateText(grant.endsAt)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No license on this email.</p>
        )}
        <p>
          <strong>Advantage Cloud:</strong>{' '}
          {profile.cloud?.owner
            ? 'Included (owner academy)'
            : profile.cloud?.entitled
              ? 'Active'
              : profile.cloud?.lapsedAt
                ? `Ended ${dateText(profile.cloud.lapsedAt)}`
                : 'Not on this license'}
        </p>
      </section>
      {profile.invites.length ? (
        <>
          <h3 className="account__heading">Access from your instructor</h3>
          {profile.invites.map((invite) => (
            <InviteAccess key={`${invite.kind}-${invite.gym}-${invite.redeemedAt ?? ''}`} invite={invite} />
          ))}
        </>
      ) : null}
      <section className="buy__card" aria-label="Restore options">
        <h3>This device</h3>
        <p>Signing in already unlocked this browser. If something looks locked, refresh it here. No email code needed.</p>
        <p>
          <button className="btn btn--white" type="button" onClick={onRefresh} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh this device'}
          </button>
        </p>
        <p>
          Other restore options: <Link to="/restore">Restore with an email code</Link>. To change your password, sign out and use
          Forgot password.
        </p>
        <p>
          <SignOutButton />
        </p>
      </section>
    </>
  );
}

export function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [payload, setPayload] = useState<LoginPayload | null>(null);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const check = usePersonCheck(!loading && !payload && mode === 'code' && !challengeId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite') ?? params.get('code');
    if (invite) {
      setInviteCode(invite);
      setMode('invite');
    }
    const preset = params.get('email');
    if (preset && isWhiteRestoreEmail(preset)) setEmail(preset.trim());
    let cancelled = false;
    void fetchAccount(true).then((result) => {
      if (cancelled) return;
      if (result.signedIn) setPayload(result.payload);
      else setAvailable(result.available);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function finish(result: LoginResult) {
    setPending(false);
    if (!result.ok) {
      setError(result.setup ? 'Sign-in is not set up on this site yet.' : result.error);
      return;
    }
    setPassword('');
    setConfirm('');
    setPayload(result.payload);
  }

  function passwordReady(): boolean {
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return false;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return false;
    }
    return true;
  }

  async function onSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("That email and password don't match.");
    setPending(true);
    finish(await signInWithPassword(email.trim(), password));
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !inviteCode.trim()) return setError('Enter your email and the invite code or link.');
    if (!passwordReady()) return;
    setPending(true);
    finish(await firstSignInWithInvite(email.trim(), inviteCode.trim(), password));
  }

  async function onRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNote(null);
    if (!isWhiteRestoreEmail(email)) return setError('Enter the email on your purchase or account.');
    if (check.state !== 'off' && !check.token) return setError('Finish the person check above, then press Email me a code.');
    setPending(true);
    const result = await restoreWhiteByEmail(email, check.token);
    setPending(false);
    check.reset();
    if (!result.ok) return setError(result.error);
    setChallengeId(result.challengeId);
    setNote(`${result.message} Enter it below with your new password. It expires in 15 minutes.`);
  }

  async function onSetWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!emailCode.trim()) return setError("That email and code don't match.");
    if (!passwordReady()) return;
    setPending(true);
    finish(await setPasswordWithEmailCode({ email: email.trim(), challengeId, code: emailCode.trim(), password }));
  }

  async function onRefresh() {
    setPending(true);
    const result = await fetchAccount(true);
    setPending(false);
    if (result.signedIn) {
      setPayload(result.payload);
      setNote('This device is up to date.');
    } else {
      setPayload(null);
    }
  }

  function pick(next: Mode) {
    setMode(next);
    setError(null);
    setNote(null);
  }

  const emailField = (
    <label className="buy__field">
      <span>Email</span>
      <input type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
    </label>
  );
  const newPasswordFields = (
    <>
      <SecretField label="New password (8 or more characters)" name="new-password" autoComplete="new-password" value={password} onChange={setPassword} />
      <SecretField label="New password again" name="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
    </>
  );

  return (
    <main className="home">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy account">
          {loading ? (
            <header className="buy__card">
              <h2>Your account</h2>
              <p role="status">Checking sign-in…</p>
            </header>
          ) : payload ? (
            <Profile payload={payload} onRefresh={() => void onRefresh()} busy={pending} />
          ) : (
            <>
              <header className="buy__card">
                <h2>Sign in</h2>
                <p>Your email is your username. Sign in once on each device and it stays signed in.</p>
                {!available ? (
                  <p className="buy__status" role="status">
                    Sign-in is not set up on this site yet. <Link to="/restore">Restore with an email code</Link> still works.
                  </p>
                ) : null}
                <nav className="account__tabs" aria-label="How to sign in">
                  <button type="button" className={mode === 'signin' ? 'btn btn--white' : 'btn btn--ghost'} onClick={() => pick('signin')} aria-pressed={mode === 'signin'}>
                    Sign in
                  </button>
                  <button type="button" className={mode === 'invite' ? 'btn btn--white' : 'btn btn--ghost'} onClick={() => pick('invite')} aria-pressed={mode === 'invite'}>
                    I have an invite code
                  </button>
                  <button type="button" className={mode === 'code' ? 'btn btn--white' : 'btn btn--ghost'} onClick={() => pick('code')} aria-pressed={mode === 'code'}>
                    First time after buying, or forgot password
                  </button>
                </nav>
              </header>
              {mode === 'signin' ? (
                <form className="buy__card" onSubmit={(event) => void onSignIn(event)}>
                  {emailField}
                  <SecretField label="Password" name="password" autoComplete="current-password" value={password} onChange={setPassword} />
                  <button className="btn btn--white" type="submit" disabled={pending}>
                    {pending ? 'Signing in…' : 'Sign in'}
                  </button>
                  <p>
                    <button type="button" className="home__text-btn" onClick={() => pick('code')}>
                      Forgot password?
                    </button>
                  </p>
                </form>
              ) : null}
              {mode === 'invite' ? (
                <form className="buy__card" onSubmit={(event) => void onInvite(event)}>
                  <p>
                    Use the email your instructor or gym owner sent the invite to, and paste the invite code or link. This
                    sets your password, opens what they picked for you, and connects you to their academy. No QR scan.
                  </p>
                  {emailField}
                  <label className="buy__field">
                    <span>Invite code or link</span>
                    <input type="text" name="invite" autoComplete="off" spellCheck={false} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
                  </label>
                  {newPasswordFields}
                  <button className="btn btn--white" type="submit" disabled={pending}>
                    {pending ? 'Setting up…' : 'Set password and sign in'}
                  </button>
                </form>
              ) : null}
              {mode === 'code' ? (
                challengeId ? (
                  <form className="buy__card" onSubmit={(event) => void onSetWithCode(event)}>
                    {emailField}
                    <SecretField label="Code from the email" name="code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} value={emailCode} onChange={setEmailCode} />
                    {newPasswordFields}
                    <button className="btn btn--white" type="submit" disabled={pending}>
                      {pending ? 'Saving…' : 'Set password and sign in'}
                    </button>
                    <p>
                      <button type="button" className="home__text-btn" onClick={() => setChallengeId('')}>
                        Send a new code
                      </button>
                    </p>
                  </form>
                ) : (
                  <form className="buy__card" onSubmit={(event) => void onRequestCode(event)}>
                    <p>
                      We email a one-time code to the address on your purchase. Enter it with a new password. You only need
                      this the first time, or if you forget your password.
                    </p>
                    {emailField}
                    <div className="restore__turnstile" ref={check.host} data-testid="turnstile" />
                    {check.state === 'error' ? (
                      <p className="buy__status buy__status--bad" role="alert">
                        The person check didn&apos;t load. Refresh the page and try again.
                      </p>
                    ) : null}
                    <button className="btn btn--white" type="submit" disabled={pending || check.state === 'loading' || check.state === 'error'}>
                      {pending ? 'Sending…' : 'Email me a code'}
                    </button>
                  </form>
                )
              ) : null}
              <p>
                Can&apos;t sign in? <Link to="/restore">Restore this device with an email code</Link> instead.
              </p>
            </>
          )}
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
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
