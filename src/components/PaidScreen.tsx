import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { subscribeEntitlement } from '../lib/entitlement';
import { refreshEntitlement } from '../lib/entitlementRefresh';
import { paidChunkLabel, preparePaidImport, type PaidLoadBlock } from '../lib/paidChunkCache';
import type { PaidChunkId } from '../lib/paidChunkAccess';

type Loaded = { node: ReactNode };

function PaidChunkMessage({
  chunk,
  kind,
  onRetry,
}: {
  chunk: PaidChunkId;
  kind: 'loading' | PaidLoadBlock;
  onRetry: () => void;
}) {
  const label = paidChunkLabel(chunk);
  const [pending, setPending] = useState(false);
  const copy =
    kind === 'loading'
      ? `Loading ${label}…`
      : kind === 'confirm'
        ? `Confirm your access to open ${label}. Restore, or enter your code, then try again.`
        : kind === 'offline'
          ? `${label} is not saved on this browser yet. Connect, then try again.`
          : `${label} could not be loaded. Refresh your access, or restore it, then try again.`;

  async function refresh() {
    setPending(true);
    try {
      await refreshEntitlement();
    } catch {
      /* the retry below shows the same screen if the refresh did not land */
    }
    setPending(false);
    onRetry();
  }

  return (
    <main className="home">
      <div className="home__inner">
        <article className="buy">
          <header className="buy__card">
            <h2>{label}</h2>
            <p role="status">{copy}</p>
          </header>
          {kind === 'loading' ? null : (
            <>
              <p>
                <button className="btn btn--white" type="button" onClick={onRetry} disabled={pending}>
                  Try again
                </button>
              </p>
              <p>
                <button className="btn btn--ghost" type="button" onClick={() => void refresh()} disabled={pending}>
                  Refresh access
                </button>
              </p>
              <p>
                <Link className="btn btn--ghost" to="/restore">
                  Restore access
                </Link>
                {' · '}
                <Link className="home__text-btn" to="/products">
                  Enter a code
                </Link>
              </p>
            </>
          )}
        </article>
      </div>
    </main>
  );
}

function PaidImport({ chunk, load }: { chunk: PaidChunkId; load: () => Promise<Loaded> }) {
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ status: 'loading' | 'ready' | 'blocked'; node?: ReactNode; reason?: PaidLoadBlock }>(
    { status: 'loading' },
  );

  useEffect(() => {
    let cancel = false;
    let started = false;
    const run = () => {
      if (cancel || started) return;
      const blocked = preparePaidImport(chunk);
      if (blocked === 'pending') {
        setView({ status: 'loading' });
        return;
      }
      if (blocked) {
        setView({ status: 'blocked', reason: blocked });
        return;
      }
      started = true;
      setView({ status: 'loading' });
      load()
        .then((result) => {
          if (!cancel) setView({ status: 'ready', node: result.node });
        })
        .catch(() => {
          if (cancel) return;
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
          setView({ status: 'blocked', reason: offline ? 'offline' : 'failed' });
        });
    };
    run();
    const stop = subscribeEntitlement(run);
    return () => {
      cancel = true;
      stop();
    };
  }, [attempt, chunk, load]);

  if (view.status === 'ready' && view.node) return view.node;
  return (
    <PaidChunkMessage
      chunk={chunk}
      kind={view.status === 'loading' ? 'loading' : (view.reason ?? 'failed')}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

const loadPro = () => import('../pages/Pro.tsx').then((mod) => ({ node: <mod.ProPage /> }));
const loadScreensaver = () => import('../pages/Screensaver.tsx').then((mod) => ({ node: <mod.ScreensaverPage /> }));
const loadMediaEdition = () =>
  import('../pages/Screensaver.tsx').then((mod) => ({ node: <mod.ScreensaverPage edition /> }));
const loadSchedule = () => import('../pages/Schedule.tsx').then((mod) => ({ node: <mod.SchedulePage /> }));
const loadClassHistory = () => import('../pages/ClassHistory.tsx').then((mod) => ({ node: <mod.ClassHistoryPage /> }));
const loadCoachUnlimited = () =>
  import('../pages/CoachUnlimited.tsx').then((mod) => ({ node: <mod.CoachUnlimitedPage /> }));
const loadAcademy = () => import('../pages/CoachUnlimited.tsx').then((mod) => ({ node: <mod.AcademyPathwayPage /> }));
const loadReview = () => import('../pages/ReviewInbox.tsx').then((mod) => ({ node: <mod.ReviewInboxPage /> }));

export function PaidProPage() {
  return <PaidImport chunk="pro-console" load={loadPro} />;
}

export function PaidScreensaverPage() {
  return <PaidImport chunk="media-console" load={loadScreensaver} />;
}

/** /media for a Pro or owner pass: the Media Console in its Media Edition dress. */
export function PaidMediaEditionPage() {
  return <PaidImport chunk="media-console" load={loadMediaEdition} />;
}

export function PaidSchedulePage() {
  return <PaidImport chunk="media-console" load={loadSchedule} />;
}

export function PaidClassHistoryPage() {
  return <PaidImport chunk="lesson-cloud" load={loadClassHistory} />;
}

export function PaidCoachUnlimitedPage() {
  return <PaidImport chunk="coach-unlimited" load={loadCoachUnlimited} />;
}

export function PaidAcademyPathwayPage() {
  return <PaidImport chunk="coach-unlimited" load={loadAcademy} />;
}

export function PaidReviewInboxPage() {
  return <PaidImport chunk="coach-unlimited" load={loadReview} />;
}
