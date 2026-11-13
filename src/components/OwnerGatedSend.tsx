import { REVIEW_VIDEO_STAYS_MESSAGE, formatDuration, formatSize } from '../lib/ownerGatedDistribution';
import '../preview/ownerGated/ownerGated.css';

export type OwnerGatedSendProps = {
  title: string;
  lesson?: string;
  media?: {
    fileName?: string;
    size?: number;
    durationMs?: number;
    thumbnailDataUrl?: string;
  } | null;
  heading?: string;
};

/**
 * Record for Review is instructor-only. This card shows the clip metadata
 * and a clear notice. It has no student recipient list and no send action.
 */
export function OwnerGatedSend({
  title,
  lesson = '',
  media,
  heading = 'Record for Review',
}: OwnerGatedSendProps) {
  return (
    <section className="ogate__card" aria-label={heading}>
      <h2>{heading}</h2>
      {media?.thumbnailDataUrl ? <img className="ogate__thumb" src={media.thumbnailDataUrl} alt="" /> : null}
      <p className="ogate__meta">
        <strong>{title || 'Untitled review'}</strong>
        {lesson ? ` · ${lesson}` : ''}
        {media?.durationMs ? ` · ${formatDuration(media.durationMs)}` : ''}
        {media?.size ? ` · ${formatSize(media.size)}` : ''}
      </p>
      <p className="ogate__status" role="status">
        {REVIEW_VIDEO_STAYS_MESSAGE}
      </p>
      <p>Students are not recipients of this clip. There is no send, division list, or download for students.</p>
    </section>
  );
}
