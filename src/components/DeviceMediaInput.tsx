import { useEffect, useRef, type ChangeEvent, type RefObject } from 'react';
import { PICKER_CANCEL_GRACE_MS, emptyChangeWasCancel } from '../lib/mediaPicker';

type CaptureFacing = 'user' | 'environment';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  id?: string;
  accept: string;
  /** Baked into markup for Record / Take photo. Omit for Pick from gallery. */
  capture?: CaptureFacing;
  multiple?: boolean;
  onFiles: (files: readonly File[]) => void | Promise<void>;
};

/**
 * Visually hidden file input for device camera / library.
 * Avoid the HTML `hidden` attribute (`display: none`) — iOS/Android can skip
 * the camera and go library-only. `.sr-only` keeps it in the layout.
 * Record / Take photo pass `capture` here so it is in the HTML from first paint.
 *
 * The file list is copied before the input is cleared. An empty change waits
 * briefly so a real Cancel (the `cancel` event) stays quiet, while a picker
 * that returns no files still reaches `onFiles`.
 */
export function DeviceMediaInput({
  inputRef,
  id,
  accept,
  capture,
  multiple = false,
  onFiles,
}: Props) {
  const cancelledAt = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const node = inputRef.current;
    if (!node) return;
    const markCancelled = () => {
      cancelledAt.current = Date.now();
    };
    node.addEventListener('cancel', markCancelled);
    return () => {
      alive.current = false;
      node.removeEventListener('cancel', markCancelled);
    };
  }, [inputRef]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const snapshot = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (snapshot.length > 0) {
      void onFiles(snapshot);
      return;
    }
    const changeAt = Date.now();
    window.setTimeout(() => {
      if (!alive.current) return;
      if (emptyChangeWasCancel(cancelledAt.current, changeAt, Date.now())) return;
      void onFiles([]);
    }, PICKER_CANCEL_GRACE_MS);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      className="sr-only"
      type="file"
      accept={accept}
      {...(capture ? { capture } : {})}
      multiple={multiple}
      tabIndex={-1}
      onChange={onChange}
    />
  );
}
