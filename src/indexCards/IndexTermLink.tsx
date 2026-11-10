/**
 * The only way a screen opens an index card.
 * A link is drawn only when the words are a term on the D8.
 * The address is an in-page mark, not an outside site.
 */
import type { ReactNode } from 'react';
import { highlightParts } from '../lib/journalIndex.ts';
import { aliasesFor, splitIndexedTerms, termIdFor } from '../lib/indexCards.ts';
import { catalogLines, openTerm, useIndexCardFile, useLiveCards } from './store.ts';
import './indexTerm.css';

export function IndexTermLink({
  name,
  children,
  className = '',
}: {
  name: string;
  children?: ReactNode;
  className?: string;
}) {
  const file = useIndexCardFile();
  const id = termIdFor(catalogLines(), file, name);
  const label = children ?? name;
  if (!id) return <>{label}</>;
  return (
    <a
      className={className ? `index-term ${className}` : 'index-term'}
      href={`#d8-${id}`}
      data-term-link={id}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openTerm(id);
      }}
    >
      {label}
    </a>
  );
}

/** Prose that turns indexed names into the same card link. Other words stay plain. */
export function IndexTermText({ text, query = '' }: { text: string; query?: string }) {
  const aliases = aliasesFor(useLiveCards());
  const parts = splitIndexedTerms(text, aliases);
  return (
    <>
      {parts.map((part, index) => {
        const body = <Marked text={part.text} query={query} />;
        if (!part.termId) return <span key={index}>{body}</span>;
        return (
          <a
            key={index}
            className="index-term"
            href={`#d8-${part.termId}`}
            data-term-link={part.termId}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openTerm(part.termId as string);
            }}
          >
            {body}
          </a>
        );
      })}
    </>
  );
}

function Marked({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="journal-hit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
