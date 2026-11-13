import { useCallback, useEffect, useRef, useState } from 'react';
import { IMAGE_RIGHTS_LABEL, IMAGE_RIGHTS_TITLE } from '../lib/imageRights';
import { Sheet } from './Sheet';
import './imageRights.css';

export type ImageRightsConfirmState = {
  pending: File | null;
  preview: string;
  owned: boolean;
  setOwned: (owned: boolean) => void;
  request: (file: File, apply: (file: File) => void | Promise<void>) => void;
  cancel: () => void;
  confirm: () => void;
  interceptFiles: (
    apply: (files: readonly File[]) => void | Promise<void>,
  ) => (files: readonly File[]) => void;
};

function revoke(url: string): void {
  if (url) URL.revokeObjectURL(url);
}

/**
 * Holds a picked photo or logo until the person checks the rights box and taps Use.
 * Cancel, Close, and the backdrop discard the file without saving.
 */
export function useImageRightsConfirm(): ImageRightsConfirmState {
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [owned, setOwned] = useState(false);
  const applyRef = useRef<((file: File) => void | Promise<void>) | null>(null);
  const previewRef = useRef('');

  const cancel = useCallback(() => {
    applyRef.current = null;
    setPending(null);
    setOwned(false);
    revoke(previewRef.current);
    previewRef.current = '';
    setPreview('');
  }, []);

  useEffect(() => () => revoke(previewRef.current), []);

  const request = useCallback((file: File, apply: (file: File) => void | Promise<void>) => {
    revoke(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    applyRef.current = apply;
    setOwned(false);
    setPreview(url);
    setPending(file);
  }, []);

  const confirm = useCallback(() => {
    if (!owned || !pending) return;
    const file = pending;
    const apply = applyRef.current;
    cancel();
    void apply?.(file);
  }, [owned, pending, cancel]);

  const interceptFiles = useCallback(
    (apply: (files: readonly File[]) => void | Promise<void>) => {
      return (files: readonly File[]) => {
        const file = files[0];
        if (!file) {
          void apply(files);
          return;
        }
        request(file, (chosen) => apply([chosen]));
      };
    },
    [request],
  );

  return { pending, preview, owned, setOwned, request, cancel, confirm, interceptFiles };
}

type Props = {
  pending: File | null;
  preview: string;
  owned: boolean;
  onOwnedChange: (owned: boolean) => void;
  onCancel: () => void;
  onUse: () => void;
};

/** Confirm sheet for a picked logo or photo. Not rendered on the idle profile or report view. */
export function ImageRightsConfirm({ pending, preview, owned, onOwnedChange, onCancel, onUse }: Props) {
  return (
    <Sheet
      open={Boolean(pending)}
      title={IMAGE_RIGHTS_TITLE}
      onClose={onCancel}
      portal
      stacked
      className="sheet--image-rights"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn" data-testid="image-rights-use" disabled={!owned} onClick={onUse}>
            Use
          </button>
        </>
      }
    >
      <div data-testid="image-rights-confirm">
        {preview ? <img className="image-rights__preview" src={preview} alt="Selected image preview" /> : null}
        <label className="image-rights__check">
          <input
            type="checkbox"
            data-testid="image-rights-owned"
            checked={owned}
            onChange={(event) => onOwnedChange(event.target.checked)}
          />
          <span>{IMAGE_RIGHTS_LABEL}</span>
        </label>
      </div>
    </Sheet>
  );
}
