import {
  CLEAR_SELECTION_LABEL,
  SELECT_ALL_LABEL,
} from '../lib/mediaSelection';

type Props = {
  allSelected: boolean;
  anySelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
};

/** Ghost actions for the folder on screen. The yellow Done button stays in the sheet footer. */
export function MediaSelectBar({ allSelected, anySelected, onSelectAll, onClear }: Props) {
  return (
    <div className="media-select" role="group" aria-label="Selection">
      <button type="button" className="btn btn--ghost" disabled={allSelected} onClick={onSelectAll}>
        {SELECT_ALL_LABEL}
      </button>
      <button type="button" className="btn btn--ghost" disabled={!anySelected} onClick={onClear}>
        {CLEAR_SELECTION_LABEL}
      </button>
    </div>
  );
}
