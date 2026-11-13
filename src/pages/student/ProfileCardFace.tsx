/**
 * My profile: the student's card face, in the gym's card look.
 * Shows what is saved on this phone (photo, name, gym, start date, trains, belt).
 * No logo on the student card: name and rank lead (owner, Nov 13 2026).
 * Each part jumps to the field below that fills it in; the belt opens My rank.
 * Read-only: nothing here saves. Save profile stays last on the page.
 */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { rankFaceLabel } from '../../lib/studentRank';
import { WornBeltMark } from './wornBelt';
import { benchmarkView } from '../../lib/studentBenchmarks';
import { cardBelt, cardDate, initialsOf } from '../../lib/rosterCard';
import { readCoachOverlay } from '../../lib/coachSync';
import { studentCardLook } from '../../lib/cardLook';
import { readStudentNoPhotos } from '../../lib/studentPhotoFlag';
import type { StudentProgressReport } from '../../lib/progress/types';
import '../../components/rosterCard/coachClipboard.css';

export const TRAINS_LABELS: Record<string, string> = { gi: 'Gi', nogi: 'No-Gi', both: 'Gi and No-Gi' };

/** Selectors for the field each face part fills in. Exported for tests. */
export const FACE_TARGETS = {
  photo: 'section[aria-label="Profile photo"]',
  name: 'form[aria-label="My profile"] input[aria-label="Name"]',
  gym: 'form[aria-label="My profile"] input[aria-label="Gym"]',
  began: 'form[aria-label="My profile"] input[aria-label="Training start date"]',
  trains: '[role="radiogroup"][aria-label="Training style"] [role="radio"]',
} as const;

export type FaceTarget = keyof typeof FACE_TARGETS;

/** Scroll to a field and focus it (or the first control inside a section). */
export function jumpToField(target: FaceTarget, doc: Document = document): boolean {
  const scope = target === 'trains'
    ? doc.querySelector<HTMLElement>(`${FACE_TARGETS.trains}[aria-checked="true"]`) ?? doc.querySelector<HTMLElement>(FACE_TARGETS.trains)
    : doc.querySelector<HTMLElement>(FACE_TARGETS[target]);
  if (!scope) return false;
  const focusable = scope.matches('input, button, select, textarea, a[href]')
    ? scope
    : scope.querySelector<HTMLElement>('input:not([type="file"]):not([hidden]), button, label[for], a[href]');
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  scope.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  focusable?.focus?.({ preventScroll: true });
  return true;
}

export function ProfileCardFace({
  report,
  portrait,
  to,
  stats,
  beltStat,
  editHref,
}: {
  report: StudentProgressReport;
  portrait: string | null;
  to: (path: string) => string;
  /** Optional card stats (e.g. mat hours), shown under the rows on the face. */
  stats?: ReactNode;
  /** Shown directly under the belt row (the mat hours frame and timer). */
  beltStat?: ReactNode;
  /** Home: the face links to the profile editor instead of jumping to fields on the page. */
  editHref?: string;
}) {
  const look = useMemo(() => {
    const overlay = readCoachOverlay(localStorage);
    return studentCardLook([...overlay.assessments, ...overlay.notes]);
  }, []);
  const noPhotos = readStudentNoPhotos(localStorage).on;
  const name = report.profile.displayName.trim();
  const gym = report.profile.gymName.trim();
  const began = cardDate(report.profile.startedOn);
  const trains = TRAINS_LABELS[benchmarkView(report).trainingStyle] ?? '';
  const belt = cardBelt(report);
  const photo = portrait && !noPhotos ? portrait : '';
  return (
    <>
    <section className="profile-face" aria-labelledby="profile-face-title" data-testid="profile-card-face">
      <h2 id="profile-face-title" className="clipboard__sr">Your card face</h2>
      <div className="clipboard profile-face__card" data-mode="student" data-style={look.style} data-skin={look.skin}>
        <div className="clipboard__board">
          <div className="clipboard__sheet profile-face__sheet">
            <div className="profile-face__top">
              <button type="button" className="profile-face__photo" onClick={() => jumpToField('photo')}>
                {photo ? <img src={photo} alt="" /> : <span className="profile-face__initials" aria-hidden="true">{initialsOf(name || 'You')}</span>}
                <span className="profile-face__hint">{noPhotos ? 'No photos · Set by family' : photo ? 'Photo' : 'Add photo'}</span>
              </button>
              <div className="profile-face__who">
                <span className="clipboard__k">Student card</span>
                <button type="button" className="profile-face__name" onClick={() => jumpToField('name')}>
                  {name || 'Add your name'}
                </button>
                {editHref ? (
                  <Link className="profile-face__edit" to={editHref} aria-label="Edit profile" data-testid="profile-edit-link">
                    ✎ Edit profile
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="profile-face__rows">
              <button type="button" className="profile-face__row" onClick={() => jumpToField('gym')}>
                {gym ? `Gym · ${gym}` : 'Add your gym'}
              </button>
              <button type="button" className="profile-face__row" onClick={() => jumpToField('began')}>
                {began ? `Training since ${began}` : 'Add the date you began'}
              </button>
              <button type="button" className="profile-face__row" onClick={() => jumpToField('trains')}>
                {trains ? `Trains · ${trains}` : 'Pick how you train'}
              </button>
              <Link className="profile-face__row profile-face__belt" to={to('/student/rank')}>
                <span className="clipboard__belt">
                  <WornBeltMark preview={belt} />
                </span>
                <span className="profile-face__belt-text">{rankFaceLabel(belt)}</span>
              </Link>
              {beltStat}
            </div>
          </div>
        </div>
      </div>
    </section>
    {/* Card stats sit right under the face, outside it, so the face keeps its own read-only, visible-text controls. */}
    {stats ? <section className="profile-face__stats" aria-label="Card stats" data-testid="profile-face-stats">{stats}</section> : null}
    </>
  );
}
