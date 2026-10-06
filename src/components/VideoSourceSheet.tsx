import {
  DRIVE_PICK_BESIDE_PHOTOS,
  PICK_FROM_DRIVE_LABEL,
  drivePickHint,
  type DrivePickKind,
} from '../lib/driveMediaPicker';
import { VIDEO_LIBRARY_LABEL, VIDEO_RECORD_LABEL, PHOTO_CAPTURE_LABEL } from '../lib/mediaPicker';
import type { MediaSheetKind } from '../lib/mediaPicker';
import { OpenMyDrive } from './OpenMyDrive';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  title: string;
  kind: MediaSheetKind;
  captureInputId: string;
  /**
   * Record input. Used when `kind` is `photo-or-video` so Take photo and
   * Record stay on separate capture inputs.
   */
  recordInputId?: string;
  libraryInputId: string;
  stacked?: boolean;
  /** Overrides the default “stays on this device” line. Gallery keeps the default. */
  stay?: string;
  /** Daily Training Videos frames Open my Drive as the day-save handoff. */
  driveOpenLabel?: string;
  driveConnectLabel?: string;
  driveConnectTitle?: string;
  driveConnectHint?: string;
  /**
   * Media Console only. Opens the gym Drive folder picker.
   * Phone Take photo / Pick from gallery stay on the other buttons.
   */
  onPickDrive?: () => void;
  onClose: () => void;
};

const COPY: Record<
  MediaSheetKind,
  { capture: string; captureHint: string; libraryHint: string; stay: string }
> = {
  video: {
    capture: VIDEO_RECORD_LABEL,
    captureHint: 'Open the camera in video mode',
    libraryHint: 'Choose an existing clip in Google Photos or on this phone',
    stay: 'Clips stay on this device. Nothing is uploaded.',
  },
  photo: {
    capture: PHOTO_CAPTURE_LABEL,
    captureHint: 'Open the camera in photo mode',
    libraryHint: 'Choose a photo in Google Photos or on this phone',
    stay: 'Photos stay on this device. Nothing is uploaded.',
  },
  'photo-or-video': {
    capture: PHOTO_CAPTURE_LABEL,
    captureHint: 'Open the camera in photo mode',
    libraryHint: 'Choose a photo or video in Google Photos or on this phone',
    stay: "Photos and clips stay on this phone. When the gym Google Drive folder is connected, a copy goes in today's class-photos folder.",
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
  recordInputId,
  libraryInputId,
  stacked = false,
  stay,
  driveOpenLabel,
  driveConnectLabel,
  driveConnectTitle,
  driveConnectHint,
  onPickDrive,
  onClose,
}: Props) {
  const copy = COPY[kind];
  const photoAndVideo = kind === 'photo-or-video';
  const driveKind: DrivePickKind = kind === 'video' ? 'video' : 'photo';
  const stayLine = stay ?? (onPickDrive ? DRIVE_PICK_BESIDE_PHOTOS : copy.stay);
  return (
    <Sheet open={open} title={title} onClose={onClose} stacked={stacked}>
      <p className="saver-sound-hint">{stayLine}</p>
      <div className="outcome-picks" role="list">
        <label htmlFor={captureInputId} className="btn outcome-pick outcome-pick--submission">
          <strong>{photoAndVideo ? PHOTO_CAPTURE_LABEL : copy.capture}</strong>
          <span>{photoAndVideo ? COPY.photo.captureHint : copy.captureHint}</span>
        </label>
        {photoAndVideo && recordInputId ? (
          <label htmlFor={recordInputId} className="btn outcome-pick outcome-pick--submission">
            <strong>{VIDEO_RECORD_LABEL}</strong>
            <span>{COPY.video.captureHint}</span>
          </label>
        ) : null}
        <label htmlFor={libraryInputId} className="btn outcome-pick outcome-pick--library">
          <strong>{VIDEO_LIBRARY_LABEL}</strong>
          <span>{copy.libraryHint}</span>
        </label>
        {onPickDrive ? (
          <button type="button" className="btn outcome-pick outcome-pick--library" onClick={onPickDrive}>
            <strong>{PICK_FROM_DRIVE_LABEL}</strong>
            <span>{drivePickHint(driveKind)}</span>
          </button>
        ) : null}
      </div>
      <OpenMyDrive
        openLabel={driveOpenLabel}
        connectLabel={driveConnectLabel}
        connectTitle={driveConnectTitle}
        connectHint={driveConnectHint}
      />
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
