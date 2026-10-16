import { useState } from 'react';
import { gameLetter, matchingGameTags } from '../../lib/progress/competition';
import { setCompetitionGame } from '../../lib/studentCompetition';
import { GAME_TAGS, type CompetitionGame, type GameTag, type StudentProgressReport } from '../../lib/progress/types';

type Commit = (next: StudentProgressReport) => StudentProgressReport;

function gamesOf(report: StudentProgressReport): Record<GameTag, CompetitionGame> {
  return (
    report.competition?.games ?? {
      a: { techniques: '', notes: '' },
      b: { techniques: '', notes: '' },
      c: { techniques: '', notes: '' },
    }
  );
}

function savedKey(games: Record<GameTag, CompetitionGame>): string {
  return GAME_TAGS.map((tag) => `${games[tag].techniques}\0${games[tag].notes}`).join('\n');
}

export function StandingGames({
  report,
  commit,
  query = '',
  only,
  onDrafts,
}: {
  report: StudentProgressReport;
  commit: Commit;
  query?: string;
  /** Journal shows the game the student just picked. Competitor shows all three. */
  only?: GameTag;
  onDrafts?: (drafts: Record<GameTag, CompetitionGame>) => void;
}) {
  const saved = gamesOf(report);
  const key = savedKey(saved);
  const [seen, setSeen] = useState(key);
  const [drafts, setDrafts] = useState(saved);
  if (seen !== key) {
    setSeen(key);
    setDrafts(saved);
  }
  onDrafts?.(seen === key ? drafts : saved);
  const tags = only ? [only] : GAME_TAGS;
  const hits = query.trim() ? new Set(matchingGameTags(report.competition, query)) : null;
  const visible = tags.filter((tag) => !hits || hits.has(tag));
  if (query.trim() && visible.length === 0) return null;

  const save = (tag: GameTag) => {
    commit(setCompetitionGame(report, tag, drafts[tag]));
  };

  return (
    <section className="ink" aria-label="Competition game">
      {only ? null : <h2 className="ink__label">A, B, and C game</h2>}
      {only ? <p className="student-quiet">This is the game you are working on for competition.</p> : null}
      {visible.map((tag) => (
        <fieldset key={tag} className="standing-game">
          <legend className="ink__label">{gameLetter(tag)} game</legend>
          <label>
            <span className="ink__label">Techniques and sequences</span>
            <textarea
              aria-label={`${gameLetter(tag)} game techniques`}
              rows={3}
              value={drafts[tag].techniques}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [tag]: { ...current[tag], techniques: event.target.value } }))
              }
            />
          </label>
          <label>
            <span className="ink__label">Game notes</span>
            <textarea
              aria-label={`${gameLetter(tag)} game plan`}
              rows={3}
              value={drafts[tag].notes}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [tag]: { ...current[tag], notes: event.target.value } }))
              }
            />
          </label>
          <button type="button" className="ink-btn" onClick={() => save(tag)}>
            {`Save game ${gameLetter(tag)}`}
          </button>
        </fieldset>
      ))}
    </section>
  );
}

/** Persist every standing-game draft that differs from the file, then return that report. */
export function applyGameDrafts(
  report: StudentProgressReport,
  drafts: Record<GameTag, CompetitionGame>,
): StudentProgressReport {
  let next = report;
  for (const tag of GAME_TAGS) {
    next = setCompetitionGame(next, tag, drafts[tag]);
  }
  return next;
}
