/**
 * A free-text field that can offer glossary terms.
 * Drop it on any textarea. The glossary itself is not a screen.
 * Native autocorrect stays on. Chips are an extra row, tapped on purpose.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { catalogLines, commitIndexCards, openTerm, useIndexCardFile } from '../indexCards/store.ts';
import { resolveGlossaryCard } from '../lib/glossaryCards.ts';
import { insertGlossaryTerm, type GlossaryMatch } from '../lib/glossaryMatch.ts';
import type { GlossaryTerm } from '../lib/glossarySource.ts';
import { useGlossarySuggest } from './useGlossarySuggest.ts';
import './glossary.css';

export function GlossaryField({
  value,
  onChange,
  label,
  hint,
  ariaLabel,
  rows = 3,
  className = '',
  blockedIds = [],
  blockedNames = [],
  maxLength,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  ariaLabel: string;
  rows?: number;
  className?: string;
  blockedIds?: readonly string[];
  blockedNames?: readonly string[];
  maxLength?: number;
  testId?: string;
}) {
  const id = useId();
  const file = useIndexCardFile();
  const [caret, setCaret] = useState(0);
  const node = useRef<HTMLTextAreaElement>(null);
  const [hiddenQuery, setHiddenQuery] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<GlossaryTerm | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const suggestion = useGlossarySuggest(value, caret, blockedIds, blockedNames);
  const visible = suggestion && suggestion.query !== hiddenQuery ? suggestion : null;
  const open = prompt ? resolveGlossaryCard(prompt, catalogLines(), file) : null;
  const openCard = open && !('error' in open) ? open : null;
  const alreadyThere = openCard?.created === false;

  useEffect(() => {
    if (!visible && !prompt) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset > 80 ? Math.round(inset) : 0);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [visible, prompt]);

  const syncCaret = (target: HTMLTextAreaElement) => setCaret(target.selectionStart ?? target.value.length);

  const pick = (match: GlossaryMatch) => {
    if (!visible) return;
    const next = insertGlossaryTerm(value, visible, match.term.name);
    onChange(next.text);
    setCaret(next.caret);
    setPrompt(match.term);
    setHiddenQuery(match.term.name);
    window.requestAnimationFrame(() => {
      node.current?.focus({ preventScroll: true });
      node.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const confirm = () => {
    if (!prompt || !openCard) return;
    if (openCard.created) commitIndexCards(openCard.file);
    openTerm(openCard.id);
    setPrompt(null);
  };

  return (
    <div className={className ? `glossary-field ${className}` : 'glossary-field'} data-testid={testId}>
      <span className="ink__label">{label}</span>
      {hint ? (
        <span className="student-quiet" aria-hidden="true">
          {hint}
        </span>
      ) : null}
      <textarea
        id={id}
        ref={node}
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        aria-label={ariaLabel}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          syncCaret(event.target);
        }}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && (visible || prompt)) {
            event.preventDefault();
            setHiddenQuery(visible?.query ?? hiddenQuery);
            setPrompt(null);
          }
        }}
      />
      {visible || prompt ? (
        <div
          className={keyboardInset > 0 ? 'glossary-panel glossary-panel--keyboard' : 'glossary-panel'}
          style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
          data-testid="glossary-panel"
        >
          {visible ? (
            <div className="glossary-suggest" role="listbox" aria-label="Matching technique names" data-testid="glossary-suggestions">
              {visible.matches.map((match) => (
                <button
                  key={match.term.id}
                  type="button"
                  className="glossary-chip"
                  role="option"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => pick(match)}
                >
                  <span>{match.term.name}</span>
                  {match.via === 'alias' ? <small>{match.matchedOn}</small> : null}
                  {match.via === 'fuzzy' ? <small>Close spelling</small> : null}
                </button>
              ))}
              <button
                type="button"
                className="glossary-textbtn"
                aria-label="Dismiss suggestions"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setHiddenQuery(visible.query)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {prompt && openCard ? (
            <div className="glossary-prompt" role="status" data-testid="glossary-tag-prompt">
              <p>{alreadyThere ? `Tag “${prompt.name}” and open its index card?` : `Tag “${prompt.name}” and create its index card?`}</p>
              <div className="glossary-prompt__actions">
                <button type="button" className="glossary-textbtn" data-testid="glossary-tag-confirm" onClick={confirm}>
                  {alreadyThere ? 'Tag and open' : 'Tag and create'}
                </button>
                <button type="button" className="glossary-textbtn" onClick={() => setPrompt(null)}>
                  Not now
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
