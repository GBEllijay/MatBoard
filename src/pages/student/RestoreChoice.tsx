/**
 * Preview for a student packet or an older JSON backup.
 * Merge and Replace are the confirmation. Closing the preview writes nothing.
 */
export function RestoreChoice({
  className,
  lines,
  restorable,
  locked,
  replaceWarning,
  onMerge,
  onReplace,
  onCancel,
}: {
  className: string;
  lines: readonly string[];
  restorable: boolean;
  locked: boolean;
  replaceWarning: string;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={className} role="group" aria-label="Restore choices">
      {lines.map((line, index) => (
        <p key={index} className="student-quiet">
          {line}
        </p>
      ))}
      {restorable ? <p>{replaceWarning}</p> : null}
      {restorable ? (
        <button type="button" className="ink-btn" disabled={locked} onClick={onMerge}>
          Merge with this phone
        </button>
      ) : null}
      {restorable ? (
        <button type="button" className="ink-btn" disabled={locked} onClick={onReplace}>
          Replace this phone
        </button>
      ) : null}
      <button type="button" className="ink-btn" onClick={onCancel}>
        {restorable ? 'Cancel restore' : 'Close'}
      </button>
    </div>
  );
}
