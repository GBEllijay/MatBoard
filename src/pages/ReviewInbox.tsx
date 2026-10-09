import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { getClassPhotoPromotion } from '../lib/classPhotoPromotions';
import { listLessonRevisions } from '../lib/lessonDrive';
import { addFolderFiles } from '../lib/photoStore';
import {
  REVIEW_APPROVE,
  REVIEW_CHANGES,
  REVIEW_GALLERY,
  REVIEW_GALLERY_DONE,
  REVIEW_GALLERY_MISSING,
  REVIEW_REJECT,
  canAddApprovedPhoto,
  decideReview,
  findReviewSubmission,
  listReviewSubmissions,
  submissionFromRevision,
  type ReviewStatus,
  type ReviewSubmission,
} from '../lib/reviewInbox';

function statusLabel(status: ReviewStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'changes') return 'Changes requested';
  if (status === 'rejected') return 'Rejected';
  return 'Waiting for review';
}

export function ReviewInboxPage() {
  const [params] = useSearchParams();
  const revisionId = params.get('revision') ?? '';
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState('');
  const [galleryNote, setGalleryNote] = useState('');
  const revisions = useMemo(() => listLessonRevisions(), [tick]);
  const inbox = useMemo(() => listReviewSubmissions(), [tick]);
  const revision = revisions.find((item) => item.revisionId === revisionId) ?? null;
  const submission = useMemo(() => {
    if (!revision) return inbox.find((item) => item.revisionId === revisionId) ?? null;
    return (
      findReviewSubmission({
        revisionId: revision.revisionId,
        dateKey: revision.dateKey,
        coachName: revision.coachName,
        planId: revision.plan.id,
      }) ?? null
    );
  }, [inbox, revision, revisionId]);

  useEffect(() => {
    setNote(submission?.instructorNote ?? '');
  }, [submission?.id, submission?.instructorNote]);

  const openSubmission = (): ReviewSubmission | null => {
    if (submission) return submission;
    if (!revision) return null;
    return submissionFromRevision({
      revisionId: revision.revisionId,
      dateKey: revision.dateKey,
      coachName: revision.coachName,
      plan: revision.plan,
    });
  };

  const decide = (status: 'approved' | 'changes' | 'rejected') => {
    const current = openSubmission();
    if (!current) return;
    decideReview(current.id, status, note);
    setGalleryNote('');
    setTick((value) => value + 1);
  };

  const addToGallery = async () => {
    if (!submission || !canAddApprovedPhoto(submission)) return;
    const photo = await getClassPhotoPromotion(submission.photoId);
    if (!photo || photo.kind !== 'photo') {
      setGalleryNote(REVIEW_GALLERY_MISSING);
      return;
    }
    const file = new File([photo.blob], photo.name || 'class-photo.jpg', { type: photo.mime || 'image/jpeg' });
    const added = await addFolderFiles([file], 'gallery');
    setGalleryNote(added > 0 ? REVIEW_GALLERY_DONE : REVIEW_GALLERY_MISSING);
  };

  const shown = submission;
  const planIntro = shown?.intro || revision?.plan.intro || '';
  const planClosing = shown?.closing || revision?.plan.closing || '';

  return (
    <main className="home home--pro">
      <div className="home__inner">
        <HomeMark to="/coach-unlimited" />
        <section className="review-inbox" aria-label="Review inbox">
          <p className="plan-card__kicker">Review inbox</p>
          <h1>Sunday review</h1>
          <p>
            <Link to="/coach-unlimited">Back to Coach Unlimited</Link>
          </p>
          {inbox.length ? (
            <ul className="plan-card__revisions" aria-label="Submissions">
              {inbox.map((item) => (
                <li key={item.id}>
                  <Link className="plan-card__review-link" to={`/review?revision=${encodeURIComponent(item.revisionId)}`}>
                    {item.coachName || 'Coach'} · {item.planLabel || item.dateKey} · {statusLabel(item.status)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No plans are waiting. A coach submits today's plan from Daily Lesson Plan.</p>
          )}
          {revision || shown ? (
            <article className="plan-card" aria-label="This submission">
              <strong>{shown?.coachName || revision?.coachName || 'Coach'}</strong>
              <span>{shown?.planLabel || revision?.dateKey}</span>
              <p>{statusLabel(shown?.status ?? 'pending')}</p>
              {planIntro ? <p>{planIntro}</p> : null}
              {planClosing ? <p>{planClosing}</p> : null}
              {shown?.photoName ? <p>Photo: {shown.photoName}</p> : <p>No class photo was submitted with this plan.</p>}
              {shown?.instructorNote ? <p role="status">{shown.instructorNote}</p> : null}
              <label className="notes__field" htmlFor="review-note">
                Note to the coach
                <textarea
                  id="review-note"
                  value={note}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="review-inbox__actions">
                <button
                  type="button"
                  className={`btn${shown?.status === 'approved' ? ' review-decision--on' : ''}`}
                  onClick={() => decide('approved')}
                >
                  {REVIEW_APPROVE}
                </button>
                <button
                  type="button"
                  className={`btn btn--ghost${shown?.status === 'changes' ? ' review-decision--on' : ''}`}
                  onClick={() => decide('changes')}
                >
                  {REVIEW_CHANGES}
                </button>
                <button
                  type="button"
                  className={`btn btn--ghost${shown?.status === 'rejected' ? ' review-decision--on' : ''}`}
                  onClick={() => decide('rejected')}
                >
                  {REVIEW_REJECT}
                </button>
              </div>
              {canAddApprovedPhoto(shown) ? (
                <button type="button" className="btn" onClick={() => void addToGallery()}>
                  {REVIEW_GALLERY}
                </button>
              ) : null}
              {galleryNote ? (
                <p role="status">{galleryNote}</p>
              ) : null}
            </article>
          ) : revisionId ? (
            <p>That Sunday review row is not on this device.</p>
          ) : null}
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
