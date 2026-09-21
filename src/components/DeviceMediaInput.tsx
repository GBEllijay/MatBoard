import type { ChangeEvent, RefObject } from 'react';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void | Promise<void>;
};

/**
 * Visually hidden file input for device camera / library.
 * Avoid the HTML `hidden` attribute (`display: none`) — iOS can skip the
 * camera sheet and go library-only. `.sr-only` keeps it in the layout.
 * `capture` is set at click time by `openDeviceMediaPicker` (Record vs library).
 */
export function DeviceMediaInput({ inputRef, accept, multiple = false, onFiles }: Props) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    void onFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <input
      ref={inputRef}
      className="sr-only"
      type="file"
      accept={accept}
      multiple={multiple}
      tabIndex={-1}
      onChange={onChange}
    />
  );
}
