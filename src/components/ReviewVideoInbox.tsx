import { REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE } from '../lib/ownerGatedDistribution';
import '../preview/ownerGated/ownerGated.css';

/**
 * Student-side preview of the blocked Record for Review path.
 * Live Student Edition does not mount this. Packets are never listed or accepted.
 */
export function ReviewVideoInbox({ heading = 'Journal video library' }: { heading?: string }) {
  return (
    <section className="ogate__card coach-update" aria-label={heading}>
      <h2>{heading}</h2>
      <p className="ogate__status" role="status">
        {REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE}
      </p>
      <p>This screen does not accept a Record for Review clip, and it does not offer a student download.</p>
    </section>
  );
}
