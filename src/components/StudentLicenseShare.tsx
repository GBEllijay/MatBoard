import { useEffect, useState } from 'react';
import { useGymLogo, useGymName } from '../hooks/useGymBrand';
import {
  issueStudentLicense,
  listStudentLicenses,
  resetStudentLicense,
  revokeStudentLicense,
  type HalfOffPointer,
  type StudentLicenseRow,
} from '../lib/studentLicenseClient';
import { resolveShareLogo } from '../lib/licenseShare';
import {
  FREE_STUDENT_LICENSES,
  STUDENT_LICENSE_EMPTY,
  STUDENT_LICENSE_GIVE,
  STUDENT_LICENSE_OWNER_ONLY,
  freeStudentLicenseTicker,
  halfOffPoolNote,
  studentInviteJoinUrl,
} from '../lib/studentLicensePool';
import { SHARE_OWNER_ONLY, copyShareLink } from '../lib/licenseShare';
import { qrDataUrl } from '../lib/qr';

function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function InviteActions({ link, qrSrc, label }: { link: string; qrSrc: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const copy = async () => setCopied(await copyShareLink(link));
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: label, text: label, url: link });
        setShared(true);
        return;
      }
    } catch {
      /* fall through to copy */
    }
    setCopied(await copyShareLink(link));
  };
  return (
    <div className="student-license__actions">
      <label>
        Invite link
        <input readOnly value={link} aria-label="Invite link" onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button type="button" className="btn" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <button type="button" className="btn btn--ghost" onClick={() => void share()}>
        {shared ? 'Shared' : 'Share'}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={!qrSrc}
        onClick={() => qrSrc && downloadDataUrl(qrSrc, 'student-edition-invite.png')}
      >
        Download QR PNG
      </button>
    </div>
  );
}

function LicenseQr({ link, caption, actions = false }: { link: string; caption: string; actions?: boolean }) {
  const logo = resolveShareLogo(useGymLogo());
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    setSrc('');
    void qrDataUrl(link).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [link]);
  return (
    <>
    <figure className="license-share__frame license-share__frame--student">
      <img className="license-share__logo" src={logo} alt="" width={56} height={56} />
      <div className="license-share__qr">
        {src ? <img src={src} alt={caption} width={240} height={240} /> : <span>Drawing QR…</span>}
      </div>
      <figcaption>
        <span className="license-share__cap">{caption}</span>
      </figcaption>
    </figure>
    {actions ? <InviteActions link={link} qrSrc={src} label={caption} /> : null}
    </>
  );
}

function HalfOffShare({ halfOff }: { halfOff: HalfOffPointer }) {
  const [copied, setCopied] = useState(false);
  const share = async () => setCopied(await copyShareLink(halfOff.code));
  const percent = typeof halfOff.percentOff === 'number' ? `${halfOff.percentOff}% off Student Edition. ` : '';
  return (
    <div className="student-license__halfoff" data-academy-half-off="code">
      <p>{halfOffPoolNote(halfOff.usesLeft, halfOff.maxUses)}</p>
      <p>
        {percent}
        {halfOff.usesLeft} uses left.
      </p>
      <LicenseQr link={halfOff.code} caption="Student Edition half-off code" />
      <label>
        Half-off code
        <input readOnly value={halfOff.code} aria-label="Half-off code" onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button type="button" className="btn" onClick={() => void share()}>
        {copied ? 'Copied' : 'Share'}
      </button>
    </div>
  );
}

/** Pro owner and Instructor Edition owner. Renders nothing until a code is stored. */
export function AcademyHalfOffShare() {
  const { halfOff } = useLicenseList();
  if (!halfOff?.code) return null;
  return <HalfOffShare halfOff={halfOff} />;
}

function useLicenseList() {
  const [rows, setRows] = useState<StudentLicenseRow[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [cap, setCap] = useState(FREE_STUDENT_LICENSES);
  const [halfOff, setHalfOff] = useState<HalfOffPointer | null>(null);
  const [role, setRole] = useState<'owner' | 'seat' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => {
    const listed = await listStudentLicenses();
    if (!listed.ok) {
      setError(listed.error);
      return;
    }
    setError(null);
    setRows(listed.claims);
    setLeft(listed.left);
    if (typeof listed.cap === 'number' && listed.cap > 0) setCap(listed.cap);
    setRole(listed.role);
    setHalfOff(listed.halfOff ?? null);
  };
  useEffect(() => {
    void reload();
  }, []);
  return { rows, left, cap, halfOff, role, error, reload, setError, setLeft, setCap };
}

function IssuedCode({
  row,
  canRevoke,
  onRevoke,
  canReset,
  onReset,
  email = '',
}: {
  row: StudentLicenseRow;
  canRevoke: boolean;
  onRevoke: (code: string) => void;
  canReset?: boolean;
  onReset?: (code: string) => void;
  email?: string;
}) {
  const gym = useGymName();
  const token = row.invite || row.code || '';
  const link = token ? studentInviteJoinUrl(origin(), token, gym, email) : '';
  const showQr = Boolean(link && (row.status === 'issued' || (row.status === 'claimed' && !row.deviceBound)));
  const [confirm, setConfirm] = useState<'revoke' | 'reset' | null>(null);
  return (
    <div className="student-license__row">
      <p>{row.status === 'claimed' ? (row.deviceBound ? 'Claimed' : 'Claimed · ready for a new device') : row.status === 'revoked' ? 'Revoked' : 'Ready to scan'}</p>
      {showQr ? <LicenseQr link={link} caption="Student Edition only" actions /> : null}
      {canReset && row.status === 'claimed' && row.deviceBound && row.code ? (
        confirm === 'reset' ? (
          <div className="student-license__confirm">
            <p>
              Release this license from the current device? The student keeps Student Edition and can scan the same
              code on a new phone. This does not use another license.
            </p>
            <button type="button" className="btn" onClick={() => onReset?.(row.code ?? '')} disabled={!row.code}>
              Reset for a new device
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
              Keep device
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm('reset')}>
            Reset for a new device
          </button>
        )
      ) : null}
      {canRevoke && row.status !== 'revoked' && (row.code || row.claimed) ? (
        confirm === 'revoke' ? (
          <div className="student-license__confirm">
            <p>
              {row.claimed
                ? 'Revoke this claimed license? That student loses Student Edition and the seat returns to your pool. The code stays dead.'
                : 'Revoke this code? It returns to your pool. The code stays dead.'}
            </p>
            <button type="button" className="btn" onClick={() => onRevoke(row.code ?? '')} disabled={!row.code}>
              Revoke and return to the pool
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
              Keep code
            </button>
          </div>
        ) : confirm === 'reset' ? null : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm('revoke')}>
            Revoke
          </button>
        )
      ) : null}
    </div>
  );
}

export function StudentLicenseOwnerPanel({
  hideIssue = false,
  reloadKey = 0,
}: {
  hideIssue?: boolean;
  reloadKey?: number;
} = {}) {
  const { rows, left, cap, halfOff, error, reload, setError, setLeft, setCap } = useLicenseList();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [issuedEmail, setIssuedEmail] = useState<{ code: string; email: string } | null>(null);
  useEffect(() => {
    void reload();
  }, [reloadKey]);
  const issue = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@') || /\s/.test(trimmed)) {
      setError("Enter the student's email.");
      return;
    }
    setBusy(true);
    setNote(null);
    const issued = await issueStudentLicense(trimmed);
    setBusy(false);
    if (!issued.ok) {
      setError(issued.error);
      if (typeof issued.error === 'string') setLeft(issued.error === STUDENT_LICENSE_EMPTY ? 0 : null);
      await reload();
      return;
    }
    setLeft(issued.left);
    if (typeof issued.cap === 'number' && issued.cap > 0) setCap(issued.cap);
    setIssuedEmail({ code: issued.code, email: trimmed });
    setEmail('');
    setNote(
      `Code issued for ${trimmed}. The student scans it, confirms their email, then adds Advantage to their Home Screen.`,
    );
    await reload();
  };
  const revoke = async (code: string) => {
    if (!code) return;
    setBusy(true);
    const result = await revokeStudentLicense(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLeft(result.left);
    if (typeof result.cap === 'number' && result.cap > 0) setCap(result.cap);
    setNote(
      result.claimed
        ? 'Revoked. That student lost this free Student Edition, and the seat is back in your pool. The code is dead.'
        : 'Revoked. The seat is back in your pool. The code is dead.',
    );
    await reload();
  };
  const reset = async (code: string) => {
    if (!code) return;
    setBusy(true);
    const result = await resetStudentLicense(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLeft(result.left);
    if (typeof result.cap === 'number' && result.cap > 0) setCap(result.cap);
    setNote('Reset. The student can scan this same code on a new phone. This did not use another license.');
    await reload();
  };
  const issued = rows.filter((row) => row.status === 'issued' || row.status === 'claimed');
  return (
    <section className="student-license" aria-label="Free Student licenses" data-student-license="owner">
      <h2>{STUDENT_LICENSE_GIVE}</h2>
      <p className="license-share__ticker" data-ticker="student-license">
        {left === null ? 'Checking free Student licenses…' : freeStudentLicenseTicker(Math.max(0, cap - left), cap)}
      </p>
      <p className="student-license__note">
        One scan uses one of your {cap} free Student Edition licenses. The link is single-use and does not expire until it
        is claimed or you revoke it. It opens Student Edition only, and never an instructor seat. Enter the student's
        email before you issue the code so they can restore this Student Edition later.
      </p>
      {left === 0 ? (
        <p role="status">{STUDENT_LICENSE_EMPTY}</p>
      ) : null}
      {halfOff?.code ? <HalfOffShare halfOff={halfOff} /> : null}
      {error ? <p role="alert">{error}</p> : null}
      {note ? <p role="status">{note}</p> : null}
      {hideIssue ? null : (
        <>
          <label className="invite-field invite-field--lead">
            Email
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="name@gym.com"
              value={email}
              aria-label="Student email"
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
            <span className="invite-field__hint">
              Advantage does not send email. Copy the invite link after you issue it.
            </span>
          </label>
          <button type="button" className="btn" onClick={() => void issue()} disabled={busy || left === 0}>
            {STUDENT_LICENSE_GIVE}
          </button>
        </>
      )}
      {issued.map((row) => (
        <IssuedCode
          key={`${row.createdAt}-${row.status}-${row.code ?? 'claimed'}`}
          row={row}
          canRevoke
          onRevoke={(code) => void revoke(code)}
          canReset
          onReset={(code) => void reset(code)}
          email={issuedEmail && row.code === issuedEmail.code ? issuedEmail.email : ''}
        />
      ))}
    </section>
  );
}

export function StudentLicenseSeatShow() {
  const { rows, error } = useLicenseList();
  const issued = rows.filter((row) => row.status === 'issued' && row.code);
  return (
    <section className="student-license" aria-label="Free Student licenses" data-student-license="seat">
      <p role="alert">{SHARE_OWNER_ONLY}</p>
      <p>{STUDENT_LICENSE_OWNER_ONLY} You can show a code the owner already issued. It still uses the owner&apos;s pool.</p>
      {error ? <p role="status">{error}</p> : null}
      {issued.length ? (
        issued.map((row) => <IssuedCode key={row.code} row={row} canRevoke={false} onRevoke={() => undefined} />)
      ) : (
        <p className="license-share__empty">No free Student license is waiting to show.</p>
      )}
    </section>
  );
}
