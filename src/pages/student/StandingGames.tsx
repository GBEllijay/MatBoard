import { useEffect, useState } from 'react';
import { gameLetter, matchingGameTags } from '../../lib/progress/competition';
import { setCompetitionGame } from '../../lib/studentCompetition';
import {
  GAME_TAGS,
  PROGRESS_NOTE_MAX,
  PROGRESS_SEQUENCE_MAX,
  type CompetitionGame,
  type GameTag,
  type StudentProgressReport,
} from '../../lib/progress/types';

type Commit = (next: StudentProgressReport) => StudentProgressReport;
type GameDrafts = Record<GameTag, CompetitionGame>;

/** Unsaved A/B/C text for this tab. The progress file changes only when that game is saved. */
export const GAME_DRAFT_STORAGE_KEY = 'matboard.student.gameDrafts.v1';

function gamesOf(report: StudentProgressReport): GameDrafts {
  return (
    report.competition?.games ?? {
      a: { techniques: '', notes: '' },
      b: { techniques: '', notes: '' },
      c: { techniques: '', notes: '' },
    }
  );
}

function savedKey(games: GameDrafts): string {
  return GAME_TAGS.map((tag) => `${games[tag].techniques}\0${games[tag].notes}`).join('\n');
}

function cloneGames(games: GameDrafts): GameDrafts {
  return {
    a: { techniques: games.a.techniques, notes: games.a.notes },
    b: { techniques: games.b.techniques, notes: games.b.notes },
    c: { techniques: games.c.techniques, notes: games.c.notes },
  };
}

/** Same trim the progress file applies on save. */
function clipGame(game: CompetitionGame): CompetitionGame {
  return {
    techniques: game.techniques.trim().slice(0, PROGRESS_SEQUENCE_MAX),
    notes: game.notes.trim().slice(0, PROGRESS_NOTE_MAX),
  };
}

export function sameCompetitionGame(a: CompetitionGame, b: CompetitionGame): boolean {
  return a.techniques === b.techniques && a.notes === b.notes;
}

export function gameIsUnsaved(draft: CompetitionGame, saved: CompetitionGame): boolean {
  return !sameCompetitionGame(draft, saved);
}

/**
 * Saving one game updates only that game.
 * A draft that still differs from the file stays. A draft the file just caught
 * up with (including trim) becomes the saved text. An untouched game takes an
 * external update.
 */
export function reconcileGameDrafts(drafts: GameDrafts, previousSaved: GameDrafts, nextSaved: GameDrafts): GameDrafts {
  const next = cloneGames(drafts);
  for (const tag of GAME_TAGS) {
    const draft = drafts[tag];
    const saved = nextSaved[tag];
    const untouched = sameCompetitionGame(draft, previousSaved[tag]);
    if (untouched || sameCompetitionGame(clipGame(draft), saved)) next[tag] = { ...saved };
    else next[tag] = draft;
  }
  return next;
}

function draftStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStoredDrafts(): Partial<GameDrafts> {
  const storage = draftStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(GAME_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<GameDrafts> = {};
    for (const tag of GAME_TAGS) {
      const row = (parsed as Record<string, unknown>)[tag];
      if (!row || typeof row !== 'object') continue;
      const techniques = (row as { techniques?: unknown }).techniques;
      const notes = (row as { notes?: unknown }).notes;
      if (typeof techniques !== 'string' || typeof notes !== 'string') continue;
      out[tag] = { techniques, notes };
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredDrafts(drafts: GameDrafts, saved: GameDrafts): void {
  const storage = draftStorage();
  if (!storage) return;
  const pending: Partial<GameDrafts> = {};
  for (const tag of GAME_TAGS) {
    if (gameIsUnsaved(drafts[tag], saved[tag])) pending[tag] = drafts[tag];
  }
  try {
    if (Object.keys(pending).length === 0) storage.removeItem(GAME_DRAFT_STORAGE_KEY);
    else storage.setItem(GAME_DRAFT_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    /* A full private-mode store still keeps the drafts in memory for this visit. */
  }
}

function hydrateDrafts(saved: GameDrafts): GameDrafts {
  const stored = readStoredDrafts();
  const next = cloneGames(saved);
  for (const tag of GAME_TAGS) {
    const draft = stored[tag];
    if (draft && gameIsUnsaved(draft, saved[tag])) next[tag] = draft;
  }
  return next;
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
  onDrafts?: (drafts: GameDrafts) => void;
}) {
  const saved = gamesOf(report);
  const key = savedKey(saved);
  const [seen, setSeen] = useState(key);
  const [baseline, setBaseline] = useState(() => cloneGames(saved));
  const [drafts, setDrafts] = useState(() => hydrateDrafts(saved));
  let showing = drafts;
  if (seen !== key) {
    showing = reconcileGameDrafts(drafts, baseline, saved);
    setSeen(key);
    setBaseline(cloneGames(saved));
    setDrafts(showing);
  }
  useEffect(() => {
    onDrafts?.(showing);
    writeStoredDrafts(showing, saved);
    const dirty = GAME_TAGS.some((tag) => gameIsUnsaved(showing[tag], saved[tag]));
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      writeStoredDrafts(showing, saved);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [onDrafts, showing, saved]);

  const tags = only ? [only] : GAME_TAGS;
  const hits = query.trim() ? new Set(matchingGameTags(report.competition, query)) : null;
  const visible = tags.filter((tag) => !hits || hits.has(tag));
  if (query.trim() && visible.length === 0) return null;

  const save = (tag: GameTag) => {
    commit(setCompetitionGame(report, tag, showing[tag]));
  };
  const edit = (tag: GameTag, field: 'techniques' | 'notes', value: string) => {
    const next = { ...showing, [tag]: { ...showing[tag], [field]: value } };
    setDrafts(next);
    writeStoredDrafts(next, saved);
  };

  return (
    <section className="ink" aria-label="Competition game">
      {only ? null : <h2 className="ink__label">A, B, and C game</h2>}
      {only ? (
        <p className="student-quiet">This is the game you are working on for competition.</p>
      ) : (
        <p className="student-quiet">Each game saves on its own. Unsaved notes stay on this phone if you leave.</p>
      )}
      {visible.map((tag) => {
        const dirty = gameIsUnsaved(showing[tag], saved[tag]);
        const state = dirty ? 'unsaved' : 'saved';
        return (
          <fieldset key={tag} className="standing-game" aria-label={`${gameLetter(tag)} game`}>
            <div className="standing-game__bar">
              <h3 className="standing-game__name">{gameLetter(tag)} game</h3>
              <p
                className={dirty ? 'standing-game__state standing-game__state--unsaved' : 'standing-game__state'}
                role="status"
                aria-live="polite"
                aria-label={`${gameLetter(tag)} game ${state}`}
              >
                {dirty ? 'Unsaved' : 'Saved'}
              </p>
            </div>
            <label>
              <span className="ink__label">Techniques and sequences</span>
              <textarea
                aria-label={`${gameLetter(tag)} game techniques`}
                rows={3}
                value={showing[tag].techniques}
                onChange={(event) => edit(tag, 'techniques', event.target.value)}
              />
            </label>
            <label>
              <span className="ink__label">Game notes</span>
              <textarea
                aria-label={`${gameLetter(tag)} game plan`}
                rows={3}
                value={showing[tag].notes}
                onChange={(event) => edit(tag, 'notes', event.target.value)}
              />
            </label>
            <button type="button" className="ink-btn ink-btn--save" onClick={() => save(tag)}>
              {`Save game ${gameLetter(tag)}`}
            </button>
          </fieldset>
        );
      })}
    </section>
  );
}

/** Persist every standing-game draft that differs from the file, then return that report. */
export function applyGameDrafts(report: StudentProgressReport, drafts: GameDrafts): StudentProgressReport {
  let next = report;
  for (const tag of GAME_TAGS) {
    next = setCompetitionGame(next, tag, drafts[tag]);
  }
  return next;
}
