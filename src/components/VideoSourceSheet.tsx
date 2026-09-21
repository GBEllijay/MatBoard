import { VIDEO_LIBRARY_LABEL, VIDEO_RECORD_LABEL } from '../lib/mediaPicker';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  title: string;
  recordInputId: string;
  libraryInputId: string;
  stacked?: boolean;
  onClose: () => void;
};

/**
 * Fat-thumb chooser used by Gallery → Videos and Daily Training Videos.
 * Record / Pick from gallery are <label htmlFor> so Android Chrome activates
 * the file input natively (programmatic input.click() from a closing dialog
 * often opens Google Photos instead of the camera).
 */
export function VideoSourceSheet({
  open,
  title,
  recordInputId,
  libraryInputId,
  stacked = false,
  onClose,
}: Props) {
  return (
    <Sheet open={open} title={title} onClose={onClose} stacked={stacked}>
      <p className="saver-sound-hint">Clips stay on this device. Nothing is uploaded.</p>
      <div className="outcome-picks" role="list">
        <label htmlFor={recordInputId} className="btn outcome-pick outcome-pick--submission">
          <strong>{VIDEO_RECORD_LABEL}</strong>
          <span>Open the camera in video mode</span>
        </label>
        <label htmlFor={libraryInputId} className="btn outcome-pick outcome-pick--library">
          <strong>{VIDEO_LIBRARY_LABEL}</strong>
          <span>Choose an existing clip on this phone</span>
        </label>
      </div>
    </Sheet>
  );
}
