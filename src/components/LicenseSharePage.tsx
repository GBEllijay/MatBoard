import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BeltHeader } from './BeltHeader';
import { HomeMark } from './HomeMark';
import { PlayExitMark } from './PlayExitMark';
import { SiteFooter } from './SiteFooter';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { providerLabel } from '../lib/academyPathway';
import { isCoachUnlimitedUnlocked, subscribeCoachUnlock } from '../lib/coachUnlock';
import { readDriveBinding, subscribeDriveBinding } from '../lib/googleDrive';
import { readGymName } from '../lib/gymName';
import { listInstructorSeats, subscribeInstructorSeats, type InstructorSeat } from '../lib/instructorSeats';
import {
  INSTRUCTOR_SHARE_HEADER,
  SHARE_COPIED_LABEL,
  SHARE_COPY_FAILED,
  SHARE_COPY_LABEL,
  SHARE_NO_FOLDER,
  SHARE_NO_INVITE,
  SHARE_OWNER_ONLY,
  STUDENT_SHARE_HEADER,
  copyShareLink,
  instructorSeatTicker,
  instructorShareLink,
  licenseShareKinds,
  shareableInvites,
  studentShareLinks,
  type ShareKind,
} from '../lib/licenseShare';
import { readOneDriveBinding } from '../lib/oneDrive';
import { COACH_UNLIMITED_PATH, PRODUCTS_PATH } from '../lib/productNames';
import { qrDataUrl } from '../lib/qr';
import { licenseIdFromStoredToken } from '../lib/studentInboxClient';

function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function useShareKinds(): ShareKind[] {
  const door = useSeatDoor();
  const coachUnlocked = useSyncExternalStore(subscribeCoachUnlock, isCoachUnlimitedUnlocked, isCoachUnlimitedUnlocked);
  return licenseShareKinds({ proUnlocked: door.proUnlocked, coachUnlocked, seated: door.seated });
}

/** Link field and one-click copy. The link is never logged. */
export function ShareLinkCopy({ link, label }: { link: string; label: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state !== 'copied') return;
    const id = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [state]);
  useEffect(() => setState('idle'), [link]);
  const copy = async () => {
    const ok = await copyShareLink(link, { field: field.current });
    setState(ok ? 'copied' : 'failed');
  };
  return (
    <div className="license-share__link">
      <label>
        <span>{label}</span>
        <input ref={field} readOnly value={link} aria-label={label} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button type="button" className="btn license-share__copy" onClick={() => void copy()} data-copy-state={state}>
        {state === 'copied' ? SHARE_COPIED_LABEL : SHARE_COPY_LABEL}
      </button>
      <p className="license-share__status" role="status" aria-live="polite">
        {state === 'copied' ? 'Link copied. Paste it into a text or message.' : ''}
      </p>
      {state === 'failed' ? <p role="alert">{SHARE_COPY_FAILED}</p> : null}
    </div>
  );
}

function FramedQr({ link, kind, caption }: { link: string; kind: ShareKind; caption: string }) {
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
    <figure className={`license-share__frame license-share__frame--${kind}`}>
      <span className="license-share__corner license-share__corner--tl" aria-hidden="true" />
      <span className="license-share__corner license-share__corner--tr" aria-hidden="true" />
      <span className="license-share__corner license-share__corner--bl" aria-hidden="true" />
      <span className="license-share__corner license-share__corner--br" aria-hidden="true" />
      <img className="license-share__logo" src="/advantage-icon.png" alt="" width={56} height={56} />
      <div className="license-share__qr">
        {src ? <img src={src} alt={caption} width={240} height={240} /> : <span className="license-share__qr-wait">Drawing QR…</span>}
      </div>
      <figcaption>{caption}</figcaption>
      <span className="license-share__belt" aria-hidden="true">
        <span className="license-share__belt-tip" />
      </span>
    </figure>
  );
}

function ShareShell({ kind, children }: { kind: ShareKind; children: ReactNode }) {
  const kinds = useShareKinds();
  const header = kind === 'instructor' ? INSTRUCTOR_SHARE_HEADER : STUDENT_SHARE_HEADER;
  const other: ShareKind = kind === 'instructor' ? 'student' : 'instructor';
  return (
    <main className={`home home--pro home--suite license-share license-share--${kind}`}>
      <div className="home__inner">
        <PlayExitMark to={COACH_UNLIMITED_PATH} />
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite license-share__page" aria-label={header}>
          <BeltHeader kind={kind === 'instructor' ? 'black' : 'blue'} worn={kind === 'instructor'} title={header} />
          {kinds.includes(kind) ? (
            <>
              {children}
              {kinds.includes(other) ? (
                <p className="license-share__switch">
                  <Link className="home__text-btn" to={`/coach-unlimited/share/${other}`}>
                    {other === 'instructor' ? INSTRUCTOR_SHARE_HEADER : STUDENT_SHARE_HEADER} code
                  </Link>
                </p>
              ) : null}
            </>
          ) : (
            <p role="alert">{SHARE_OWNER_ONLY}</p>
          )}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}

function InstructorShareBody() {
  const [seats, setSeats] = useState<InstructorSeat[]>(() => listInstructorSeats());
  useEffect(() => subscribeInstructorSeats(() => setSeats(listInstructorSeats())), []);
  const invites = shareableInvites(seats);
  const [pick, setPick] = useState('');
  const seat = invites.find((row) => row.id === pick) ?? invites[0] ?? null;
  return (
    <>
      <p className="license-share__lead">
        Scan or paste this coach seat invite. It opens Instructor Collaboration and signs the coach in to the seat
        you issued.
      </p>
      <p className="license-share__ticker" data-ticker="instructor">
        {instructorSeatTicker(seats)}
      </p>
      {seat ? (
        <>
          {invites.length > 1 ? (
            <label className="license-share__pick">
              <span>Invite for</span>
              <select value={seat.id} onChange={(event) => setPick(event.target.value)}>
                {invites.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.email}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <FramedQr kind="instructor" link={instructorShareLink(seat, origin())} caption={`Coach seat invite for ${seat.email}`} />
          <ShareLinkCopy label="Coach invite link" link={instructorShareLink(seat, origin())} />
        </>
      ) : (
        <p className="license-share__empty">
          {SHARE_NO_INVITE}{' '}
          <Link className="home__text-btn" to="/instructors">
            Issue a coach invite
          </Link>
        </p>
      )}
    </>
  );
}

function StudentShareBody() {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeDriveBinding(() => setTick((value) => value + 1)), []);
  const links = studentShareLinks({
    google: readDriveBinding(),
    oneDrive: readOneDriveBinding(),
    gymName: readGymName(),
    license: licenseIdFromStoredToken() ?? undefined,
    origin: origin(),
  });
  void tick;
  const [pick, setPick] = useState(0);
  const row = links[pick] ?? links[0] ?? null;
  return (
    <>
      <p className="license-share__lead">
        Students scan or paste this link to open Connect to my academy in Student Edition. Students do not pay to use
        this folder.
      </p>
      {row ? (
        <>
          {links.length > 1 ? (
            <div className="license-share__tabs" role="group" aria-label="Academy folder">
              {links.map((item, index) => (
                <button
                  key={item.provider}
                  type="button"
                  aria-pressed={item === row}
                  className="license-share__tab"
                  onClick={() => setPick(index)}
                >
                  {providerLabel(item.provider)}
                </button>
              ))}
            </div>
          ) : null}
          <FramedQr
            kind="student"
            link={row.url}
            caption={`Student Edition academy link · ${row.pathway.folderName}${row.pathway.gymName ? ` · ${row.pathway.gymName}` : ''}`}
          />
          <ShareLinkCopy label="Student Edition link" link={row.url} />
        </>
      ) : (
        <p className="license-share__empty">
          {SHARE_NO_FOLDER}{' '}
          <Link className="home__text-btn" to={COACH_UNLIMITED_PATH}>
            Connect the folder
          </Link>
        </p>
      )}
    </>
  );
}

/** Advantage Instructor Edition share page: the coach seat invite QR and link. */
export function InstructorSharePage() {
  return (
    <ShareShell kind="instructor">
      <InstructorShareBody />
    </ShareShell>
  );
}

/** Advantage Student Edition share page: the academy pathway QR and link. */
export function StudentSharePage() {
  return (
    <ShareShell kind="student">
      <StudentShareBody />
    </ShareShell>
  );
}
