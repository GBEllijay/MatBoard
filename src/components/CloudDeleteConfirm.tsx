type Props = {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** In-page confirm. Deletes only happen after this is accepted. */
export function CloudDeleteConfirm({ title, body, confirmLabel = 'Delete', busy, onCancel, onConfirm }: Props) {
  return (
    <div className="cloud-delete-confirm" role="dialog" aria-label={title} data-cloud-delete-confirm="">
      <p>{body}</p>
      <div className="cloud-delete-confirm__actions">
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onConfirm} data-cloud-delete-go="">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
