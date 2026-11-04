import { useEffect, useState } from 'react';
import { useGymLogo } from '../hooks/useGymBrand';
import {
  issueStudentLicense,
  listStudentLicenses,
  revokeStudentLicense,
  type HalfOffPointer,
  type StudentLicenseRow,
} from '../lib/studentLicenseClient';
import { readGymName } from '../lib/gymName';
import { resolveShareLogo } from '../lib/licenseShare';
import {
  FREE_STUDENT_LICENSES,
  STUDENT_LICENSE_EMPTY,
  STUDENT_LICENSE_GIVE,
  STUDENT_LICENSE_OWNER_ONLY,
  freeStudentLicenseTicker,
  halfOffPoolNote,
  studentLicenseClaimUrl,
} from '../lib/studentLicensePool';
import { SHARE_OWNER_ONLY } from '../lib/licenseShare';
import { qrDataUrl } from '../lib/qr';

function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function LicenseQr({ link, caption }: { link: string; caption: string }) {
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
    <figure className="license-share__frame license-share__frame--student">
      <img className="license-share__logo" src={logo} alt="" width={56} height={56} />
      <div className="license-share__qr">
        {src ? <img src={src} alt={caption} width={240} height={240} /> : <span>Drawing QR…</span>}
      </div>
      <figcaption>
        <span className="license-share__cap">{caption}</span>
      </figcaption>
    </figure>
  );
}

function useLicenseList() {
  const [rows, setRows] = useState<StudentLicenseRow[]>([]);
  const [left, setLeft] = useState<number | null>(null);
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
    setRole(listed.role);
    setHalfOff(listed.halfOff ?? null);
  };
  useEffect(() => {
    void reload();
  }, []);
  return { rows, left, halfOff, role, error, reload, setError, setLeft };
}

function IssuedCode({
  row,
  canRevoke,
  onRevoke,
}: {
  row: StudentLicenseRow;
  canRevoke: boolean;
  onRevoke: (code: string) => void;
}) {
  const gym = readGymName();
  const link = row.code ? studentLicenseClaimUrl(origin(), row.code, gym) : '';
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="student-license__row">
      <p>{row.status === 'claimed' ? 'Claimed' : row.status === 'revoked' ? 'Revoked' : 'Ready to scan'}</p>
      {row.status === 'issued' && link ? <LicenseQr link={link} caption="Free Student license" /> : null}
      {canRevoke && row.status !== 'revoked' && (row.code || row.claimed) ? (
        confirm ? (
          <div className="student-license__confirm">
            <p>
              {row.claimed
                ? 'Revoke this claimed license? That student loses Student Edition and the seat returns to your pool. The code stays dead.'
                : 'Revoke this code? It returns to your pool. The code stays dead.'}
            </p>
            <button type="button" className="btn" onClick={() => onRevoke(row.code ?? '')} disabled={!row.code}>
              Revoke and return to the pool
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>
              Keep code
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirm(true)}>
            Revoke
          </button>
        )
      ) : null}
    </div>
  );
}

export function StudentLicenseOwnerPanel() {
  const { rows, left, halfOff, error, reload, setError, setLeft } = useLicenseList();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const issue = async () => {
    setBusy(true);
    setNote(null);
    const issued = await issueStudentLicense();
    setBusy(false);
    if (!issued.ok) {
      setError(issued.error);
      if (typeof issued.error === 'string') setLeft(issued.error === STUDENT_LICENSE_EMPTY ? 0 : null);
      await reload();
      return;
    }
    setLeft(issued.left);
    setNote('Code issued. The student scans it, enters their email, then adds Advantage to their Home Screen.');
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
    setNote(
      result.claimed
        ? 'Revoked. That student lost this free Student Edition, and the seat is back in your pool. The code is dead.'
        : 'Revoked. The seat is back in your pool. The code is dead.',
    );
    await reload();
  };
  const issued = rows.filter((row) => row.status === 'issued' || row.status === 'claimed');
  return (
    <section className="student-license" aria-label="Free Student licenses" data-student-license="owner">
      <h2>{STUDENT_LICENSE_GIVE}</h2>
      <p className="license-share__ticker" data-ticker="student-license">
        {left === null ? 'Checking free Student licenses…' : freeStudentLicenseTicker(occupiedFromLeft(left))}
      </p>
      <p className="student-license__note">
        One scan uses one license from your Pro pool. The student enters an email so the home screen app can restore
        this Student Edition.
      </p>
      {left === 0 ? (
        <p role="status">{STUDENT_LICENSE_EMPTY}</p>
      ) : null}
      {left === 0 && halfOff ? (
        <div className="student-license__halfoff">
          <p>{halfOffPoolNote(halfOff.usesLeft)}</p>
          <label>
            100-use half-off code
            <input readOnly value={halfOff.code} aria-label="100-use half-off code" onFocus={(event) => event.currentTarget.select()} />
          </label>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {note ? <p role="status">{note}</p> : null}
      <button type="button" className="btn" onClick={() => void issue()} disabled={busy || left === 0}>
        {STUDENT_LICENSE_GIVE}
      </button>
      {issued.map((row) => (
        <IssuedCode key={`${row.createdAt}-${row.status}-${row.code ?? 'claimed'}`} row={row} canRevoke onRevoke={(code) => void revoke(code)} />
      ))}
    </section>
  );
}

function occupiedFromLeft(left: number): number {
  return Math.max(0, FREE_STUDENT_LICENSES - left);
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
