import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COMPETITOR_ROSTER_LABEL } from '../lib/coachCopy';
import {
  checkedInCompetitors,
  namesForBracket,
  obviousRankingFile,
  orderCheckedInByRanking,
  seededBracketSize,
  type SeededCompetitor,
} from '../lib/checkInSeeds';
import type { RankingFile } from '../lib/rankingStore';
import { COMPETITOR_ROSTER_PATH } from '../lib/productNames';
import type { Student } from '../lib/rosterStore';
import { byeCountFor, firstRoundLabel } from '../lib/tournamentStore';
import { Sheet } from './Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
  students: readonly Student[];
  files: readonly RankingFile[];
  bracketTitle: string;
  hasNames: boolean;
  hasResults: boolean;
  sizeMax: number;
  onApply: (names: string[]) => void;
};

/** '' is roster order. null means a ranking list still has to be chosen. */
function initialRankingId(
  files: readonly RankingFile[],
  checked: readonly Student[],
  title: string,
): string | null {
  if (!files.length) return '';
  const obvious = obviousRankingFile(files, {
    title,
    divisions: checked.map((student) => student.division),
  });
  return obvious ? obvious.id : null;
}

export function CheckInFillSheet({
  open,
  onClose,
  students,
  files,
  bracketTitle,
  hasNames,
  hasResults,
  sizeMax,
  onApply,
}: Props) {
  const [rankingId, setRankingId] = useState<string | null>(null);
  const [primed, setPrimed] = useState(false);
  const checked = checkedInCompetitors(students);
  if (open && !primed) {
    setPrimed(true);
    setRankingId(initialRankingId(files, checked, bracketTitle));
  } else if (!open && primed) {
    setPrimed(false);
  }

  const rows = rankingId ? (files.find((file) => file.id === rankingId)?.rows ?? []) : [];
  const ordered: SeededCompetitor[] = rankingId === null ? [] : orderCheckedInByRanking(students, rows);
  const size = ordered.length ? seededBracketSize(ordered.length, sizeMax) : 0;
  const placed = ordered.slice(0, size);
  const byes = size ? byeCountFor(size) : 0;
  const canFill = rankingId !== null && placed.length > 0;
  const replaces = hasNames || hasResults;

  return (
    <Sheet
      open={open}
      title="Fill from check-in"
      onClose={onClose}
      footer={
        checked.length ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={!canFill}
              onClick={() => onApply(namesForBracket(ordered, sizeMax))}
            >
              {replaces ? 'Replace names' : 'Fill bracket'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : null
      }
    >
      {checked.length === 0 ? (
        <>
          <p className="tournament__sheet-copy">
            Nobody is checked in. On the {COMPETITOR_ROSTER_LABEL}, tap Check In for each person who is
            here today. That list is the only selection for this fill. It does not change the roster.
          </p>
          <Link className="text-link" to={COMPETITOR_ROSTER_PATH}>
            Open {COMPETITOR_ROSTER_LABEL}
          </Link>
        </>
      ) : (
        <>
          <p className="tournament__sheet-copy">
            {checked.length} checked in. Ranked names follow the ranking list. Anyone checked in who is
            not on that list follows in roster order. Check-in stays as it is.
          </p>
          {files.length ? (
            <div className="tournament__size-presets" role="radiogroup" aria-label="Ranking list">
              <button
                type="button"
                role="radio"
                aria-checked={rankingId === ''}
                className={`chip${rankingId === '' ? ' chip--on' : ''}`}
                onClick={() => setRankingId('')}
              >
                Roster order
              </button>
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  role="radio"
                  aria-checked={rankingId === file.id}
                  className={`chip${rankingId === file.id ? ' chip--on' : ''}`}
                  onClick={() => setRankingId(file.id)}
                >
                  {file.division && file.division.trim().toLowerCase() !== file.name.trim().toLowerCase()
                    ? `${file.name} · ${file.division}`
                    : file.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="tournament__sheet-copy">
              No ranking file on this device, so this uses roster order.
            </p>
          )}
          {rankingId === null ? (
            <p className="tournament__sheet-copy">Pick a ranking list to preview the seed order.</p>
          ) : (
            <>
              <p className="tournament__sheet-copy">
                {firstRoundLabel(size)} · size {size}
                {byes ? ` · ${byes} ${byes === 1 ? 'bye' : 'byes'}` : ''}
                {ordered.length > placed.length
                  ? `. This board holds ${size}, so the first ${size} are placed.`
                  : ''}
                {ordered.length === 1 ? '. The smallest bracket is 2, so one slot stays open.' : ''}
              </p>
              <ol className="checkin-seeds">
                {placed.map((seed, index) => (
                  <li key={seed.id}>
                    <span>{index + 1}</span>
                    <strong>{seed.name}</strong>
                    <em className="checkin-seeds__place">{seed.place == null ? 'Unranked' : `Place ${seed.place}`}</em>
                  </li>
                ))}
              </ol>
              {replaces ? (
                <p className="tournament__sheet-copy">
                  This replaces names on the open bracket.
                  {hasResults ? ' Results on this board clear.' : ''} Other saved brackets stay put.
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
