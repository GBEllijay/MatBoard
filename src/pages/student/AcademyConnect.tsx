/**
 * Connect to my academy (Student Edition), in the dark card look from the
 * Design Critic mock: Scan gym QR first, Paste invite link second, the
 * Student ID in its own card. Connected shows the gym, what is shared,
 * Leave academy and Changing gyms, each behind a confirm sheet.
 *
 * Controls kept: live scanner, photo of the QR, paste link, sign in,
 * folder tools, share card, show student ID, save inbox code.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AcademyQrScanner } from '../../components/AcademyQrScanner';
import { GoogleDriveFolderTools } from '../../components/GoogleDriveFolderTools';
import { StudentIdentityPanel } from '../../components/StudentIdentityPanel';
import { ShareCardWithCoach } from '../../components/StudentToCoachShare';
import {
  ACADEMY_ACCESS_ERROR,
  ACADEMY_CONNECT_LABEL,
  ACADEMY_FREE_NOTE,
  STUDENT_ONEDRIVE_INTENT_KEY,
  clearPendingPathway,
  loadAcademyLink,
  parseAcademyInput,
  probeGoogleFolder,
  probeOneDriveFolder,
  providerLabel,
  readPendingPathway,
  rememberPendingPathway,
  rememberStudentOneDriveIntent,
  saveStudentDriveLink,
  takeStudentOneDriveIntent,
  type AcademyPathway,
  type StudentDriveLink,
} from '../../lib/academyPathway';
import {
  ACADEMY_STALE_COPY,
  LEAVE_LOGO_PROMPT,
  forgetAcademyFolder,
  gymIdsFor,
  joinAcademy,
  leaveAcademy,
  moveAcademyFolder,
  readAcademyStale,
  readMembership,
} from '../../lib/academyMembership';
import { subscribeGoogleDriveDisconnect } from '../../lib/driveSession';
import { driveAccountEmail, driveSignInFailureCopy, requestDriveConsent } from '../../lib/googleDrive';
import { dismissOneDriveResume, oneDriveSignInFailureCopy } from '../../lib/oneDrive';
import { requestOneDriveConsent } from '../../lib/oneDriveAuth';
import { ACADEMY_STALE_EVENT } from '../../lib/studentDriveCopy';
import { STUDENT_GYM_LOGO_KEY, STUDENT_GYM_LOGO_SYNC_KEY, readStudentGymLogo } from '../../lib/studentGymMark';

export const LEAVE_ACADEMY_LABEL = 'Leave academy';
export const SWITCH_GYM_LABEL = 'Scan new gym QR';
export const SEND_ID_LABEL = 'Send my ID to coach';
export const RESCAN_LABEL = 'Rescan';

const BTN = 'am-btn';
const PRIMARY = 'am-btn am-btn--primary';
const DANGER = 'am-btn am-btn--danger';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join('') || 'A').toUpperCase();
}

function sinceLabel(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Is this link the gym already connected? Then it reconnects, no switch sheet. */
export function sameAcademy(pathway: AcademyPathway, link: StudentDriveLink | null, storage: Pick<Storage, 'getItem'>): boolean {
  if (!link) return false;
  const current = readMembership(storage).current;
  const ids = gymIdsFor(pathway.folderId, pathway.license);
  if (current && current.ids.some((id) => ids.includes(id))) return true;
  if (link.folderId === pathway.folderId) return true;
  const a = (pathway.gymName || '').trim().toLowerCase();
  return Boolean(a) && a === (link.gymName || current?.name || '').trim().toLowerCase();
}

/** "Your academy link may have changed" with Rescan. Hidden until a 403/404. */
export function AcademyStaleBanner({ onRescan, rescanHref }: { onRescan?: () => void; rescanHref?: string }) {
  const [stale, setStale] = useState(() => readAcademyStale(localStorage));
  useEffect(() => {
    const update = () => setStale(readAcademyStale(localStorage));
    window.addEventListener(ACADEMY_STALE_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(ACADEMY_STALE_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="am-stale" role="alert">
      <p>{ACADEMY_STALE_COPY}</p>
      {onRescan ? (
        <button type="button" className={PRIMARY} onClick={onRescan}>
          {RESCAN_LABEL}
        </button>
      ) : (
        <a className={PRIMARY} href={rescanHref ?? '/student/academy#rescan'}>
          {RESCAN_LABEL}
        </a>
      )}
    </div>
  );
}

type Sheet =
  | { kind: 'leave'; step: 'confirm' | 'logo' }
  | { kind: 'switch'; next: AcademyPathway; step: 'confirm' | 'logo' }
  | null;

export function AcademyConnect({ showHeading = true }: { showHeading?: boolean }) {
  const [params] = useSearchParams();
  const [text, setText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pathway, setPathway] = useState<AcademyPathway | null>(null);
  const [linked, setLinked] = useState<StudentDriveLink | null>(() => loadAcademyLink(localStorage));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showId, setShowId] = useState(false);
  const [scanSignal, setScanSignal] = useState(0);
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeGoogleDriveDisconnect(() => {
        setLinked(loadAcademyLink(localStorage));
      }),
    [],
  );

  const useLink = (value: string) => {
    const parsed = parseAcademyInput(value);
    if (!parsed) {
      setPathway(null);
      setError('That is not an academy link. Paste the link from your coach, or open the QR on this phone.');
      return;
    }
    setError('');
    const current = loadAcademyLink(localStorage);
    if (current && !sameAcademy(parsed, current, localStorage)) {
      setPathway(null);
      setSheet({ kind: 'switch', next: parsed, step: 'confirm' });
      setStatus('');
      return;
    }
    setPathway(parsed);
    setStatus(`${parsed.folderName} on ${providerLabel(parsed.provider)}. ${ACADEMY_FREE_NOTE}`);
  };

  // Any gym logo kept on this phone, shown or not, gets the question.
  const hasLogo = () => Boolean(localStorage.getItem(STUDENT_GYM_LOGO_KEY) || localStorage.getItem(STUDENT_GYM_LOGO_SYNC_KEY));

  const finish = async (next: AcademyPathway, leaving?: { removeLogo: boolean }) => {
    setBusy(true);
    setError('');
    const connect = (saved: Omit<StudentDriveLink, 'role'> & { accountLabel: string | null }) => {
      // Leave only after the new folder answered, so a failed sign-in keeps the old gym.
      if (leaving) leaveAcademy(localStorage, leaving);
      const link = saveStudentDriveLink(localStorage, { ...saved, role: 'academy' });
      joinAcademy(localStorage, {
        folderId: next.folderId,
        provider: next.provider,
        gymName: next.gymName || link.folderName,
        license: next.license,
      });
      setLinked(link);
      setPathway(null);
      setStatus(`Connected to ${next.gymName || link.folderName}. ${ACADEMY_FREE_NOTE}`);
      clearPendingPathway();
    };
    try {
      if (next.provider === 'googleDrive') {
        const auth = await requestDriveConsent();
        if (!auth.ok) {
          setError(driveSignInFailureCopy(auth));
          return;
        }
        const probed = await probeGoogleFolder(auth.token, next.folderId);
        if (!probed.ok) {
          setError(probed.error || ACADEMY_ACCESS_ERROR);
          return;
        }
        const email = await driveAccountEmail(auth.token).catch(() => null);
        connect({
          provider: 'googleDrive',
          folderId: next.folderId,
          folderName: probed.name || next.folderName,
          accountLabel: email,
          gymName: next.gymName,
        });
        return;
      }
      rememberPendingPathway(next);
      rememberStudentOneDriveIntent('academy');
      const auth = await requestOneDriveConsent();
      if (!auth.ok) {
        if (auth.code === 'redirecting') return;
        setError(oneDriveSignInFailureCopy(auth));
        return;
      }
      const probed = await probeOneDriveFolder(auth.token, next.folderId);
      if (!probed.ok) {
        setError(probed.error || ACADEMY_ACCESS_ERROR);
        return;
      }
      connect({
        provider: 'oneDrive',
        folderId: next.folderId,
        folderName: probed.name || next.folderName,
        accountLabel: auth.accountLabel,
        gymName: next.gymName,
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const fromQuery = params.get('academy');
    if (fromQuery) useLink(fromQuery);
    if (typeof window !== 'undefined' && window.location.hash === '#rescan') setScanSignal((n) => n + 1);
    let intent: string | null = null;
    try {
      intent = sessionStorage.getItem(STUDENT_ONEDRIVE_INTENT_KEY);
    } catch {
      intent = null;
    }
    if (intent !== 'academy') return;
    takeStudentOneDriveIntent();
    dismissOneDriveResume();
    const pending = readPendingPathway();
    if (pending) {
      setPathway(pending);
      void finish(pending);
    }
    // finish is recreated each render; this resume runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = (removeLogo: boolean) => {
    const result = leaveAcademy(localStorage, { removeLogo });
    setSheet(null);
    setLinked(null);
    setPathway(null);
    setShowId(false);
    setTick((n) => n + 1);
    setStatus(
      `You left ${result.left || 'your academy'}. Your journal, reports, and student ID stay on this phone.` +
        (removeLogo ? ' The old gym logo was removed.' : ''),
    );
  };

  const membership = readMembership(localStorage);
  const gymName = linked ? linked.gymName || membership.current?.name || linked.folderName : '';
  const since = sinceLabel(membership.current?.since ?? 0);
  const logo = linked ? readStudentGymLogo(localStorage) : null;

  const pasteBlock = (
    <>
      <button type="button" className={BTN} aria-expanded={pasteOpen} onClick={() => setPasteOpen((open) => !open)}>
        Paste invite link
      </button>
      {pasteOpen || text ? (
        <div className="am-paste">
          <label>
            <span className="am-label">Academy link</span>
            <input
              aria-label="Academy link"
              value={text}
              placeholder="https://advantagebjjtimer.com/…?academy="
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <button type="button" className={BTN} onClick={() => useLink(text)}>
            Use this academy link
          </button>
        </div>
      ) : null}
      {pathway ? (
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => void finish(pathway)}>
          {busy ? 'Connecting…' : `Sign in to ${providerLabel(pathway.provider)}`}
        </button>
      ) : null}
    </>
  );

  const logoStep = (onChoice: (removeLogo: boolean) => void) => (
    <>
      <h2>{LEAVE_LOGO_PROMPT}</h2>
      <p>The old gym logo is on your journal. You can keep it or remove it.</p>
      <div className="am-two">
        <button type="button" className={BTN} onClick={() => onChoice(false)}>
          Keep logo
        </button>
        <button type="button" className={DANGER} onClick={() => onChoice(true)}>
          Remove logo
        </button>
      </div>
    </>
  );

  return (
    <section className="am" aria-label={ACADEMY_CONNECT_LABEL}>
      {showHeading ? <h2 className="am-title">{ACADEMY_CONNECT_LABEL}</h2> : null}
      <AcademyStaleBanner
        onRescan={() => {
          document.getElementById('rescan')?.scrollIntoView?.({ block: 'start' });
          setScanSignal((n) => n + 1);
        }}
      />
      {!linked ? (
        <div className="am-grid">
          <div className="am-card" id="rescan">
            <span className="am-tag">Not connected</span>
            <h2>Link your journal to your gym</h2>
            <p>Your coach shares a QR or invite link. Connecting lets your coach see your belt progress and send you notes. {ACADEMY_FREE_NOTE}</p>
            <ol className="am-steps">
              <li>
                <b>1</b>Ask your coach for the academy QR
              </li>
              <li>
                <b>2</b>Scan it, then sign in to the gym's Drive folder
              </li>
            </ol>
            <AcademyQrScanner onScan={useLink} scanLabel="Scan gym QR" scanClassName={PRIMARY} buttonClassName={BTN} startSignal={scanSignal} />
            {pasteBlock}
          </div>
          <div className="am-card">
            <span className="am-tag">Your student ID</span>
            <h2>Already on a roster?</h2>
            <p>Your coach can link you from their roster card with this ID. It stays the same when you connect.</p>
            <StudentIdentityPanel connected={false} />
          </div>
        </div>
      ) : (
        <div className="am-grid">
          <div className="am-card">
            <span className="am-tag am-tag--on">● Connected</span>
            <div className="am-gym">
              {logo ? <img className="am-crest am-crest--img" src={logo} alt="" /> : <div className="am-crest" aria-hidden="true">{initials(gymName)}</div>}
              <div>
                <h2>{gymName}</h2>
                <div className="am-kv">
                  {since ? `Connected since ${since} · ` : ''}
                  {providerLabel(linked.provider)}
                </div>
                <div className="am-kv">Folder: {linked.folderName}</div>
              </div>
            </div>
            <p className="sr-only" role="status">
              Connected to {linked.folderName} on {providerLabel(linked.provider)}
              {linked.gymName ? ` · ${linked.gymName}` : ''}.
            </p>
            <div className="am-share" aria-label="What's shared">
              <div className="am-row">
                <span>Your card (name, belt, stripes)</span>
                <span>When you send it</span>
              </div>
              <div className="am-row">
                <span>Coach updates &amp; notes</span>
                <span>You accept each one</span>
              </div>
              <div className="am-row">
                <span>Journal, photos &amp; weigh-ins</span>
                <span>Stay on this phone</span>
              </div>
            </div>
            <ShareCardWithCoach
              withPhoto={false}
              label={SEND_ID_LABEL}
              buttonClassName={PRIMARY}
              note="One tap: your coach gets your student ID, name, and belt to link your roster card."
              onNoChannel={() => setShowId(true)}
            />
            <ShareCardWithCoach buttonClassName={BTN} />
            {linked.provider === 'googleDrive' ? (
              <GoogleDriveFolderTools
                folderId={linked.folderId}
                buttonClassName={BTN}
                primaryClassName={BTN}
                picker="inline"
                onPick={(folder) => {
                  const saved = saveStudentDriveLink(localStorage, {
                    ...linked,
                    folderId: folder.id,
                    folderName: folder.name,
                  });
                  moveAcademyFolder(localStorage, folder.id);
                  setLinked(saved);
                  setStatus(`Connected to ${saved.folderName}. ${ACADEMY_FREE_NOTE}`);
                }}
                onDisconnected={() => {
                  setLinked(loadAcademyLink(localStorage));
                  setStatus('Google Drive is disconnected on this device. Connect again to pick a folder or account.');
                }}
              />
            ) : null}
            <button
              type="button"
              className={BTN}
              onClick={() => {
                forgetAcademyFolder(localStorage);
                setLinked(null);
                setStatus('Academy folder disconnected on this phone. The folder itself is unchanged. Scan the gym QR to connect again.');
              }}
            >
              Disconnect academy folder
            </button>
            <button type="button" className={DANGER} onClick={() => setSheet({ kind: 'leave', step: 'confirm' })}>
              {LEAVE_ACADEMY_LABEL}
            </button>
          </div>
          <div className="am-card" id="rescan">
            <span className="am-tag">Changing gyms?</span>
            <h2>{SWITCH_GYM_LABEL}</h2>
            <p>Scanning a new academy QR replaces your current connection. Your journal stays on this device.</p>
            <AcademyQrScanner onScan={useLink} scanLabel={SWITCH_GYM_LABEL} scanClassName={BTN} buttonClassName={BTN} startSignal={scanSignal} />
            {pasteBlock}
            <div className="am-note">{gymName} will stop receiving your updates once you switch.</div>
          </div>
          <div className="am-card">
            <span className="am-tag">Your student ID</span>
            <StudentIdentityPanel connected={showId || Boolean(linked)} />
          </div>
        </div>
      )}
      {sheet ? (
        <div className="am-sheet" role="dialog" aria-modal="false" aria-label={sheet.kind === 'leave' ? 'Leave academy' : 'Switch gyms'}>
          {sheet.kind === 'leave' && sheet.step === 'confirm' ? (
            <>
              <h2>Leave {gymName || 'your academy'}?</h2>
              <p>
                Your coach stops seeing new belt progress and you stop getting notes. Files from this gym are not accepted after you leave. Your journal, reports, and student ID stay on this phone. You can join again with the gym QR.
              </p>
              <div className="am-two">
                <button type="button" className={BTN} autoFocus onClick={() => setSheet(null)}>
                  Keep connected
                </button>
                <button
                  type="button"
                  className={DANGER}
                  onClick={() => (hasLogo() ? setSheet({ kind: 'leave', step: 'logo' }) : leave(false))}
                >
                  {LEAVE_ACADEMY_LABEL}
                </button>
              </div>
            </>
          ) : null}
          {sheet.kind === 'leave' && sheet.step === 'logo' ? logoStep(leave) : null}
          {sheet.kind === 'switch' && sheet.step === 'confirm' ? (
            <>
              <h2>Switch to {sheet.next.gymName || sheet.next.folderName}?</h2>
              <p>This replaces {gymName || 'your academy'}. Only one academy can be connected at a time. Your journal stays on this phone.</p>
              <div className="am-two">
                <button type="button" className={BTN} autoFocus onClick={() => setSheet(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={PRIMARY}
                  disabled={busy}
                  onClick={() => {
                    if (hasLogo()) {
                      setSheet({ ...sheet, step: 'logo' });
                      return;
                    }
                    const next = sheet.next;
                    setSheet(null);
                    void finish(next, { removeLogo: false });
                  }}
                >
                  Switch gyms
                </button>
              </div>
            </>
          ) : null}
          {sheet.kind === 'switch' && sheet.step === 'logo'
            ? logoStep((removeLogo) => {
                const next = sheet.next;
                setSheet(null);
                void finish(next, { removeLogo });
              })
            : null}
        </div>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
