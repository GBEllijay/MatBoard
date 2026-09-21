import { VIDEO_LIBRARY_LABEL, VIDEO_RECORD_LABEL } from '../lib/mediaPicker';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  title: string;
  stacked?: boolean;
  onClose: () => void;
  onRecord: () => void;
  onLibrary: () => void;
};

/**
 * Fat-thumb chooser used by Gallery → Videos and Daily Training Videos.
 * Record is primary (phone camera in video mode). Gallery/library stays a
 * first-class second action — not camera-only.
 */
export function VideoSourceSheet({
  open,
  title,
  stacked = false,
  onClose,
  onRecord,
  onLibrary,
}: Props) {
  const pick = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Sheet open={open} title={title} onClose={onClose} stacked={stacked}>
      <p className="saver-sound-hint">Clips stay on this device. Nothing is uploaded.</p>
      <div className="outcome-picks" role="list">
        <button
          type="button"
          className="btn outcome-pick outcome-pick--submission"
          onClick={() => pick(onRecord)}
        >
          <strong>{VIDEO_RECORD_LABEL}</strong>
          <span>Open the camera in video mode</span>
        </button>
        <button type="button" className="btn outcome-pick outcome-pick--library" onClick={() => pick(onLibrary)}>
          <strong>{VIDEO_LIBRARY_LABEL}</strong>
          <span>Choose an existing clip on this phone</span>
        </button>
      </div>
    </Sheet>
  );
}
