import type { ChangeEvent, RefObject } from 'react';

type CaptureFacing = 'user' | 'environment';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  id?: string;
  accept: string;
  /** Baked into markup for Record / Take photo. Omit for Pick from gallery. */
  capture?: CaptureFacing;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void | Promise<void>;
};

/**
 * Visually hidden file input for device camera / library.
 * Avoid the HTML `hidden` attribute (`display: none`) — iOS/Android can skip
 * the camera and go library-only. `.sr-only` keeps it in the layout.
 * Record / Take photo pass `capture` here so it is in the HTML from first paint.
 */
export function DeviceMediaInput({
  inputRef,
  id,
  accept,
  capture,
  multiple = false,
  onFiles,
}: Props) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    void onFiles(event.target.files);
    event.target.value = '';
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
