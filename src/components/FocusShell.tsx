import { useState, type ReactNode } from 'react';
import { notesPreview } from '../lib/focusLayout';
import './focusShell.css';

export type FocusTab = {
  id: string;
  label: string;
  panel: ReactNode;
};

/**
 * Phone: the clip leads, then Start / Stop / Fullscreen, the step bar,
 * the sticky Hide screen, a short note, and tabs.
 * Wide screens: the same stage on the left and the tabs in a side panel.
 * Hide screen is the existing control. This shell only places it.
 */
export function FocusShell({
  eyebrow,
  title,
  more,
  player,
  stepLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  summaryTitle,
  summaryText,
  hide,
  tabs,
  initialTab,
}: {
  eyebrow?: string;
  title: string;
  more?: ReactNode;
  player: ReactNode;
  stepLabel: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  summaryTitle: string;
  summaryText: string;
  hide: ReactNode;
  tabs: readonly FocusTab[];
  initialTab?: string;
}) {
  const first = tabs[0]?.id ?? '';
  const [tab, setTab] = useState(initialTab && tabs.some((item) => item.id === initialTab) ? initialTab : first);
  const [moreOpen, setMoreOpen] = useState(false);
  const [summaryKey, setSummaryKey] = useState(`${summaryTitle}\n${summaryText}`);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const nextKey = `${summaryTitle}\n${summaryText}`;
  if (summaryKey !== nextKey) {
    setSummaryKey(nextKey);
    setSummaryOpen(false);
  }
  const active = tabs.some((item) => item.id === tab) ? tab : first;
  const panel = tabs.find((item) => item.id === active)?.panel ?? null;
  const preview = notesPreview(summaryText);
  const body = summaryOpen || !preview.clipped ? summaryText.trim() : preview.text;

  return (
    <div className="focus-shell" data-focus-shell="">
      <header className="focus-shell__bar">
        <div className="focus-shell__brand">
          {eyebrow ? <p className="focus-shell__eyebrow">{eyebrow}</p> : null}
          <h1 className="focus-shell__title">{title}</h1>
        </div>
        {more ? (
          <div className="focus-shell__more">
            <button
              type="button"
              className="btn btn--ghost focus-shell__more-btn"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              More
            </button>
            {moreOpen ? <div className="focus-shell__more-panel">{more}</div> : null}
          </div>
        ) : null}
      </header>
      <div className="focus-shell__body">
        <div className="focus-shell__player">{player}</div>
        <div className="focus-shell__step" role="group" aria-label="Class order">
            <button
              type="button"
              className="btn btn--ghost focus-shell__arrow"
              aria-label="Previous technique"
              disabled={prevDisabled}
              onClick={onPrev}
            >
              ‹
            </button>
            <p className="focus-shell__step-label" data-focus-step="" aria-live="polite">
              {stepLabel}
            </p>
            <button
              type="button"
              className="btn btn--ghost focus-shell__arrow"
              aria-label="Next technique"
              disabled={nextDisabled}
              onClick={onNext}
            >
              ›
            </button>
          </div>
          <div className="focus-shell__hide" data-focus-hide="">
            {hide}
          </div>
          <div className="focus-shell__summary">
            <h2 className="focus-shell__summary-title">{summaryTitle}</h2>
            {body ? <p className="focus-shell__summary-text">{body}</p> : <p className="focus-shell__summary-text">No notes yet.</p>}
            {preview.clipped ? (
              <button type="button" className="btn btn--ghost focus-shell__more-notes" onClick={() => setSummaryOpen((open) => !open)}>
                {summaryOpen ? 'Show less' : 'Show more'}
              </button>
            ) : null}
        </div>
        <div className="focus-shell__drawer">
          <div className="focus-shell__tabs" role="tablist" aria-label="Class drawer">
            {tabs.map((item) => {
              const on = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`focus-tab-${item.id}`}
                  aria-selected={on}
                  aria-controls={`focus-panel-${item.id}`}
                  className={on ? 'focus-shell__tab focus-shell__tab--on' : 'focus-shell__tab'}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div
            className="focus-shell__panel"
            role="tabpanel"
            id={`focus-panel-${active}`}
            aria-labelledby={`focus-tab-${active}`}
            data-focus-panel={active}
          >
            {panel}
          </div>
        </div>
      </div>
    </div>
  );
}
