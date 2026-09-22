import { VIDEO_LIBRARY_LABEL, VIDEO_RECORD_LABEL, PHOTO_CAPTURE_LABEL } from '../lib/mediaPicker';
import type { MediaSourceKind } from '../lib/mediaPicker';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  title: string;
  kind: MediaSourceKind;
  captureInputId: string;
  libraryInputId: string;
  stacked?: boolean;
  onClose: () => void;
};

const COPY: Record<
  MediaSourceKind,
  { capture: string; captureHint: string; libraryHint: string; stay: string }
> = {
  video: {
    capture: VIDEO_RECORD_LABEL,
    captureHint: 'Open the camera in video mode',
    libraryHint: 'Choose an existing clip on this phone',
    stay: 'Clips stay on this device. Nothing is uploaded.',
  },
  photo: {
    capture: PHOTO_CAPTURE_LABEL,
    captureHint: 'Open the camera in photo mode',
    libraryHint: 'Choose an existing photo on this phone',
    stay: 'Photos stay on this device. Nothing is uploaded.',
  },
};

/**
 * Fat-thumb chooser for Gallery photos, Gallery videos, and Daily Training.
 * Capture / Pick from gallery are <label htmlFor> so Android Chrome activates
 * the file input natively (programmatic input.click() from a closing dialog
 * often opens Google Photos instead of the camera).
 */
export function MediaSourceSheet({
  open,
  title,
  kind,
  captureInputId,
  libraryInputId,
  stacked = false,
  onClose,
}: Props) {
  const copy = COPY[kind];
  return (
    <Sheet open={open} title={title} onClose={onClose} stacked={stacked}>
      <p className="saver-sound-hint">{copy.stay}</p>
      <div className="outcome-picks" role="list">
        <label htmlFor={captureInputId} className="btn outcome-pick outcome-pick--submission">
          <strong>{copy.capture}</strong>
          <span>{copy.captureHint}</span>
        </label>
        <label htmlFor={libraryInputId} className="btn outcome-pick outcome-pick--library">
          <strong>{VIDEO_LIBRARY_LABEL}</strong>
          <span>{copy.libraryHint}</span>
        </label>
      </div>
    </Sheet>
  );
}

/** Daily Training / Videos — same sheet, video copy. */
export function VideoSourceSheet(
  props: Omit<Props, 'kind' | 'captureInputId'> & { recordInputId: string },
) {
  const { recordInputId, ...rest } = props;
  return <MediaSourceSheet kind="video" captureInputId={recordInputId} {...rest} />;
}
