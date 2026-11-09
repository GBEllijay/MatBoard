/**
 * Design preview for a tappable indexed term.
 * Sample journal only. It does not write a rating, a journal, or a D8 score.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  EMPTY_VIDEOS,
  JOURNAL,
  JOURNAL_PREVIEW_COUNT,
  previewEntries,
  ratingNote,
  seeAllLabel,
  shouldCloseSwipe,
  shownRating,
  termById,
  termIdFromSearch,
  type Rating,
  type SampleTerm,
} from './model';
import './termCard.css';

export { TERM_CARD_PATH } from './model';

function currentTermId(): string | null {
  if (typeof window === 'undefined') return null;
  return termIdFromSearch(window.location.search);
}

function pathWithTerm(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('term', id);
  else url.searchParams.delete('term');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function TermCardPreviewPage() {
  const [termId, setTermId] = useState<string | null>(currentTermId);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const term = termById(termId);

  const closeTerm = useCallback(() => {
    const state = window.history.state as { termCard?: string } | null;
    if (state?.termCard) {
      window.history.back();
      return;
    }
    const next = pathWithTerm(null);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.replaceState(window.history.state, '', next);
    }
    setTermId(null);
  }, []);

  const openTerm = useCallback((id: string, opener: HTMLElement) => {
    if (!termById(id)) return;
    openerRef.current = opener;
    window.history.pushState({ termCard: id }, '', pathWithTerm(id));
    setTermId(id);
  }, []);

  useEffect(() => {
    const sync = () => setTermId(termIdFromSearch(window.location.search));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (!termId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeTerm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [termId, closeTerm]);

  useEffect(() => {
    if (!termId) return;
    const html = document.documentElement;
    const body = document.body;
    const htmlOverflow = html.style.overflow;
    const bodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = htmlOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, [termId]);

  useEffect(() => {
    if (termId) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    openerRef.current?.focus();
  }, [termId]);

  return (
    <main className={term ? 'tc-page tc-page--open' : 'tc-page'}>
      <h1 className="tc-sr">Journal</h1>
      <div className="tc-wrap" inert={term ? true : undefined}>
        <p className="tc-sample">Sample</p>
        <article className="tc-note" aria-label="Sample journal">
          {JOURNAL.map((block) => (
            <section className="tc-day" key={block.id}>
              <h2 className="tc-date">{block.date}</h2>
              <p className="tc-prose">
                {block.parts.map((part, index) =>
                  part.kind === 'text' ? (
                    <span key={`${block.id}-${index}`}>{part.text}</span>
                  ) : (
                    <button
                      key={`${block.id}-${part.id}`}
                      type="button"
                      className="tc-term"
                      aria-expanded={termId === part.id}
                      onClick={(event) => openTerm(part.id, event.currentTarget)}
                    >
                      {part.text}
                    </button>
                  ),
                )}
              </p>
            </section>
          ))}
        </article>
      </div>
      {term ? (
        <TermSheet
          term={term}
          rating={ratings[term.id]}
          onRate={(value) => setRatings((current) => ({ ...current, [term.id]: value }))}
          onClose={closeTerm}
        />
      ) : null}
    </main>
  );
}

function TermSheet({
  term,
  rating,
  onRate,
  onClose,
}: {
  term: SampleTerm;
  rating: Rating | undefined;
  onRate: (value: Rating) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const journalId = useId();
  const videosId = useId();
  const rateId = useId();
  const noteId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, active: false });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const entries = previewEntries(term, expanded);
  const shown = shownRating(rating);
  const canSeeAll = term.entries.length > JOURNAL_PREVIEW_COUNT;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const endDrag = (dx: number, dy: number) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    setOffset(0);
    if (shouldCloseSwipe(dy, dx)) onClose();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, active: true };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    setOffset(Math.max(0, event.clientY - drag.current.y));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    endDrag(event.clientX - drag.current.x, event.clientY - drag.current.y);
  };

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const root = panelRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')].filter(
      (node) => !node.hasAttribute('disabled'),
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = root.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="tc-sheet">
      <button type="button" className="tc-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div
        ref={panelRef}
        className="tc-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-term={term.id}
        data-dragging={dragging ? 'true' : 'false'}
        style={{ '--tc-drag': `${offset}px` } as CSSProperties}
        onKeyDown={trapTab}
      >
        <div className="tc-grab">
          <div
            className="tc-handle"
            data-sheet-handle="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => endDrag(0, 0)}
          >
            <span className="tc-handle-bar" aria-hidden="true" />
          </div>
          <div className="tc-head-row">
            <button ref={closeRef} type="button" className="tc-close" onClick={onClose}>
              Close
            </button>
            <span className="tc-sample">Sample</span>
          </div>
        </div>
        <div className="tc-scroll">
          <div>
            <h2 id={titleId} className="tc-title">
              {term.name}
            </h2>
            <p className="tc-face">
              <span className="tc-kicker">D8 face</span>
              <span className="tc-face-name">{term.face}</span>
            </p>
          </div>
          <section className="tc-block" aria-labelledby={journalId}>
            <h3 id={journalId}>Your journal</h3>
            <ul className="tc-entries">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="tc-entry"
                    aria-pressed={activeId === entry.id}
                    onClick={() => setActiveId((current) => (current === entry.id ? null : entry.id))}
                  >
                    <time>{entry.date}</time>
                    <span>{entry.line}</span>
                  </button>
                </li>
              ))}
            </ul>
            {canSeeAll ? (
              <button type="button" className="tc-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
                {expanded ? `Show the latest ${JOURNAL_PREVIEW_COUNT}` : seeAllLabel(term.entries.length)}
              </button>
            ) : null}
          </section>
          <section className="tc-block" aria-labelledby={videosId}>
            <h3 id={videosId}>Videos</h3>
            {term.videos.length === 0 ? (
              <p className="tc-empty">{EMPTY_VIDEOS}</p>
            ) : (
              term.videos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  className="tc-video"
                  aria-pressed={videoId === video.id}
                  onClick={() => setVideoId((current) => (current === video.id ? null : video.id))}
                >
                  <span className="tc-thumb" aria-hidden="true" />
                  <span className="tc-video-copy">
                    <span className="tc-video-title">{video.title}</span>
                    <span className="tc-video-len">{video.length}</span>
                  </span>
                </button>
              ))
            )}
          </section>
          <section className="tc-block" aria-labelledby={rateId}>
            <h3 id={rateId}>Rate it</h3>
            <div className="tc-rates" role="group" aria-label={`Rate ${term.name}`} aria-describedby={noteId}>
              {([1, 2, 3, 4, 5] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="tc-rate"
                  aria-pressed={shown === value}
                  aria-label={`${term.name} ${value}`}
                  onClick={() => onRate(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p id={noteId} className="tc-hint">
              {ratingNote(rating)}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
