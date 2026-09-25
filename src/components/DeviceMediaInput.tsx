import { useRef, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { releaseInputFiles, takeInputFiles } from '../lib/mediaCapture';

type CaptureFacing = 'user' | 'environment';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  id?: string;
  accept: string;
  /** Baked into markup for Record / Take photo. Omit for Pick from gallery. */
  capture?: CaptureFacing;
  multiple?: boolean;
  /** Fired when the camera or picker is opened, before a file comes back. */
  onActivate?: () => void;
  onFiles: (files: File[]) => void | Promise<void>;
};

/**
 * Visually hidden file input for device camera / library.
 * Avoid the HTML `hidden` attribute (`display: none`) — iOS/Android can skip
 * the camera and go library-only. The control sits in a 1px fixed box so
 * focusing it does not scroll Media Console back to the top.
 * Record / Take photo pass `capture` here so it is in the HTML from first paint.
 * The form swallows submit: a camera return can submit the input and reload
 * the page, which drops the new card. The input stays filled until the save
 * finishes so the camera file can be compressed before it is released.
 */
export function DeviceMediaInput({
  inputRef,
  id,
  accept,
  capture,
  multiple = false,
  onActivate,
  onFiles,
}: Props) {
  const pending = useRef(false);

  const deliver = (input: HTMLInputElement, files: File[]) => {
    if (!files.length) {
      releaseInputFiles(input);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    void Promise.resolve()
      .then(() => onFiles(files))
      .finally(() => {
        pending.current = false;
        releaseInputFiles(input);
      });
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    deliver(input, takeInputFiles(input));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const input = inputRef.current;
    if (!input) return;
    deliver(input, takeInputFiles(input));
  };

  return (
    <form className="device-media-form" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        id={id}
        className="device-media-input"
        type="file"
        accept={accept}
        {...(capture ? { capture } : {})}
        multiple={multiple}
        tabIndex={-1}
        onClick={() => onActivate?.()}
        onFocus={() => onActivate?.()}
        onChange={onChange}
      />
    </form>
  );
}
