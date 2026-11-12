import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteFooter } from '../../components/SiteFooter';
import { applyClaimedStudentLicense, claimStudentLicense } from '../../lib/studentLicenseClient';
import {
  ADD_TO_HOME_ANDROID,
  ADD_TO_HOME_EMAIL,
  ADD_TO_HOME_IPHONE,
  ADD_TO_HOME_TITLE,
  STUDENT_CLAIM_KEPT_HIGHER,
  STUDENT_CLOUD_CONNECTED,
  isStudentInviteValue,
} from '../../lib/studentLicensePool';
import { qrDataUrl } from '../../lib/qr';
import { restoreHref } from '../../lib/whiteUnlock';

/** Shown after the claim is saved. The home screen app has its own storage, so Restore uses this email. */
export function StudentLicenseClaimSuccess({
  email,
  gym,
  cloud,
  keptHigher = false,
}: {
  email: string;
  gym: string;
  cloud: boolean;
  keptHigher?: boolean;
}) {
  return (
    <>
      {keptHigher ? (
        <p role="status">{STUDENT_CLAIM_KEPT_HIGHER}</p>
      ) : (
        <p role="status">This phone has Student Edition{gym ? ` at ${gym}` : ''}.</p>
      )}
      {cloud ? <p>{STUDENT_CLOUD_CONNECTED}</p> : <p>You are connected to this gym.</p>}
      {keptHigher ? null : (
        <div className="student-license-claim__tip">
          <h2>{ADD_TO_HOME_TITLE}</h2>
          <p>{ADD_TO_HOME_IPHONE}</p>
          <p>{ADD_TO_HOME_ANDROID}</p>
          <p>{ADD_TO_HOME_EMAIL}.</p>
          <p>
            Use <strong>{email}</strong>. The home screen app does not keep this browser&apos;s license.
          </p>
          <Link className="btn" to={restoreHref(email)}>
            Restore in the installed app
          </Link>
        </div>
      )}
      <Link className="btn btn--ghost" to="/student">
        Open Student Edition
      </Link>
    </>
  );
}

function JoinQr({ link }: { link: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    void qrDataUrl(link).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [link]);
  if (!src) return null;
  return (
    <figure className="student-license-claim__qr">
      <img src={src} alt="Student Edition invite QR" width={240} height={240} />
    </figure>
  );
}

/**
 * A student opens this from the gym's QR. The email is how Restore finds the
 * license after Add to Home Screen, because that app does not share Safari's storage.
 */
export function StudentLicenseClaimPage({
  code,
  gymName,
  showQr = false,
}: {
  code: string;
  gymName: string;
  showQr?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ email: string; cloud: boolean; gym: string; keptHigher: boolean } | null>(null);
  const valid = isStudentInviteValue(code);
  const joinLink = typeof window === 'undefined' ? '' : window.location.href;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@') || /\s/.test(trimmed)) {
      setError('Enter the email you will use inside the installed app.');
      return;
    }
    setPending(true);
    setError(null);
    void (async () => {
      const result = await claimStudentLicense({ code, email: trimmed });
      if (!result.ok) {
        setPending(false);
        setError(result.error);
        return;
      }
      const applied = await applyClaimedStudentLicense(result, gymName);
      setDone({ email: trimmed, cloud: result.cloud, gym: gymName.trim(), keptHigher: applied.keptHigher });
      setPending(false);
    })();
  };

  return (
    <main className="home home--student student-license-claim">
      <div className="home__inner">
        <section className="student-license-claim__card" aria-label="Claim Student Edition">
          <h1>Advantage Student Edition</h1>
          {done ? (
            <StudentLicenseClaimSuccess
              email={done.email}
              gym={done.gym}
              cloud={done.cloud}
              keptHigher={done.keptHigher}
            />
          ) : (
            <form onSubmit={submit}>
              <p>Your gym gave you a free Student Edition license. Enter the email you can open on this phone.</p>
              {showQr && valid ? <JoinQr link={joinLink} /> : null}
              {!valid ? <p role="alert">This link is not a free Student license.</p> : null}
              <label>
                Email
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={320}
                  required
                  value={email}
                  aria-label="Email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <button type="submit" className="btn" disabled={!valid || pending}>
                {pending ? 'Claiming…' : 'Claim Student Edition'}
              </button>
            </form>
          )}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

/** Public page at /join/student?code=... that shows the QR and the claim form. */
export function StudentJoinPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? params.get('invite') ?? '';
  const gymName = params.get('gym') ?? '';
  return <StudentLicenseClaimPage code={code} gymName={gymName} showQr />;
}
