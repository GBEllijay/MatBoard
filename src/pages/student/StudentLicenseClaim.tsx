import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter } from '../../components/SiteFooter';
import { applyClaimedStudentLicense, claimStudentLicense } from '../../lib/studentLicenseClient';
import {
  ADD_TO_HOME_ANDROID,
  ADD_TO_HOME_EMAIL,
  ADD_TO_HOME_IPHONE,
  ADD_TO_HOME_TITLE,
  STUDENT_CLOUD_CONNECTED,
  isStudentLicenseCode,
} from '../../lib/studentLicensePool';
import { restoreHref } from '../../lib/whiteUnlock';

/** Shown after the claim is saved. The home screen app has its own storage, so Restore uses this email. */
export function StudentLicenseClaimSuccess({ email, gym, cloud }: { email: string; gym: string; cloud: boolean }) {
  return (
    <>
      <p role="status">This phone has Student Edition{gym ? ` at ${gym}` : ''}.</p>
      {cloud ? <p>{STUDENT_CLOUD_CONNECTED}</p> : <p>You are connected to this gym.</p>}
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
      <Link className="btn btn--ghost" to="/student">
        Open Student Edition
      </Link>
    </>
  );
}

/**
 * A student opens this from the gym's QR. The email is how Restore finds the
 * license after Add to Home Screen, because that app does not share Safari's storage.
 */
export function StudentLicenseClaimPage({ code, gymName }: { code: string; gymName: string }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ email: string; cloud: boolean; gym: string } | null>(null);
  const valid = isStudentLicenseCode(code);

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
      await applyClaimedStudentLicense(result, gymName);
      setDone({ email: trimmed, cloud: result.cloud, gym: gymName.trim() });
      setPending(false);
    })();
  };

  return (
    <main className="home home--student student-license-claim">
      <div className="home__inner">
        <section className="student-license-claim__card" aria-label="Claim Student Edition">
          <h1>Advantage Student Edition</h1>
          {done ? (
            <StudentLicenseClaimSuccess email={done.email} gym={done.gym} cloud={done.cloud} />
          ) : (
            <form onSubmit={submit}>
              <p>Your gym gave you a free Student Edition license. Enter the email you can open on this phone.</p>
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
