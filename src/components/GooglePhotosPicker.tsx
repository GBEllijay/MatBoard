import { useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import {
  PHOTOS_PICK_EMPTY,
  PHOTOS_PICK_FAILED,
  PHOTOS_PICK_OPEN,
  PHOTOS_PICK_TIMED_OUT,
  PHOTOS_PICK_TITLE,
  PHOTOS_PICK_WAITING,
  PHOTOS_SIGN_IN_AGAIN,
  deletePhotosPickerSession,
  getPhotosPickerSession,
  listPickedPhotos,
  nextPhotosPoll,
  photosItemsForKind,
  photosKindMissCopy,
  photosOwnerFacingError,
  photosPickerUrl,
  photosPollWaitMs,
  requestPhotosToken,
  createPhotosPickerSession,
  type PhotosPickKind,
  type PhotosPickedItem,
} from '../lib/googlePhotos';

type Props = {
  open: boolean;
  kind: PhotosPickKind;
  stacked?: boolean;
  getPopup: () => Window | null;
  onClose: () => void;
  onDone: (items: PhotosPickedItem[]) => void;
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => resolve(), ms);
    const stop = () => {
      window.clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      stop();
      return;
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}

/**
 * Opens Google’s picker for the connected gym library, then returns the
 * photos and videos the owner selected. Bytes stay in Google Photos until
 * the parent copies the chosen files onto this phone for the TV.
 */
export function GooglePhotosPicker({ open, kind, stacked = false, getPopup, onClose, onDone }: Props) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const getPopupRef = useRef(getPopup);
  const onDoneRef = useRef(onDone);
  getPopupRef.current = getPopup;
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    let finished = false;
    let sessionId = '';
    let token = '';
    setLink('');
    setError('');

    const run = async () => {
      const access = (await requestPhotosToken('silent')) ?? (await requestPhotosToken('consent'));
      if (ac.signal.aborted) return;
      if (!access) {
        setError(PHOTOS_SIGN_IN_AGAIN);
        return;
      }
      token = access;
      const created = await createPhotosPickerSession(access);
      if (ac.signal.aborted) return;
      sessionId = created.id;
      const url = photosPickerUrl(created.pickerUri);
      setLink(url);
      const popup = getPopupRef.current();
      if (popup && !popup.closed) popup.location.href = url;
      const started = Date.now();
      let pollInterval = created.pollInterval;
      let timeoutIn = created.timeoutIn;
      for (;;) {
        if (ac.signal.aborted) return;
        const current = await getPhotosPickerSession(access, created.id);
        if (ac.signal.aborted) return;
        pollInterval = current.pollInterval ?? pollInterval;
        timeoutIn = current.timeoutIn ?? timeoutIn;
        const step = nextPhotosPoll({
          elapsedMs: Date.now() - started,
          pollInterval,
          timeoutIn,
          mediaItemsSet: current.mediaItemsSet,
        });
        if (step === 'timeout') {
          setError(PHOTOS_PICK_TIMED_OUT);
          return;
        }
        if (step === 'ready') {
          const picked = photosItemsForKind(await listPickedPhotos(access, created.id), kind);
          if (ac.signal.aborted) return;
          if (!picked.length) {
            setError(photosKindMissCopy(kind));
            return;
          }
          finished = true;
          onDoneRef.current(picked);
          return;
        }
        await sleep(photosPollWaitMs(pollInterval), ac.signal);
      }
    };

    void run().catch((reason: unknown) => {
      if (ac.signal.aborted || finished) return;
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(photosOwnerFacingError(reason) || PHOTOS_PICK_FAILED);
    });

    return () => {
      ac.abort();
      if (!finished && sessionId && token) {
        void deletePhotosPickerSession(token, sessionId).catch(() => undefined);
      }
    };
  }, [open, kind]);

  return (
    <Sheet className="sheet--dock-footer" open={open} title={PHOTOS_PICK_TITLE} stacked={stacked} onClose={onClose}>
      <p className="saver-sound-hint">{PHOTOS_PICK_WAITING}</p>
      {link ? (
        <a className="btn" href={link} target="_blank" rel="noreferrer">
          {PHOTOS_PICK_OPEN}
        </a>
      ) : error ? null : (
        <p className="notes__gallery-status" role="status">
          Opening Google Photos…
        </p>
      )}
      {error ? (
        <p className="notes__gallery-status notes__gallery-status--empty" role="status">
          {error || PHOTOS_PICK_EMPTY}
        </p>
      ) : null}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
