import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGlossarySuggest } from '../glossary/useGlossarySuggest.ts';
import { GLOSSARY } from '../lib/glossary.ts';
import {
  EXCLUDED_GLOSSARY_FACES,
  GLOSSARY_BASE_CARD_TOTAL,
  GLOSSARY_BASE_FACE_IDS,
  cardsForFace,
  countCardsByFace,
  findBaseCard,
  glossaryBaseFaceLabel,
  linksFrom,
  pickGlossaryBaseSuggestion,
  removeGlossaryBaseLink,
  type GlossaryBaseCard,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
  type GlossaryBaseLink,
  type GlossaryBaseLinkSource,
} from '../lib/glossaryBaseCards.ts';
import {
  GLOSSARY_DEBOUNCE_MS,
  GLOSSARY_MIN_CHARS,
  glossaryFaceLabel,
  glossaryQuerySpans,
  type GlossaryMatch,
} from '../lib/glossaryMatch.ts';
import './techniqueTreeGlossary.css';

const EXCLUDED_TERM_IDS = GLOSSARY.filter((term) =>
  (EXCLUDED_GLOSSARY_FACES as readonly string[]).includes(term.faceId),
).map((term) => `gl.${term.key}`);

export function GlossaryBaseCardsPanel({
  catalog,
  onCatalogChange,
}: {
  catalog: GlossaryBaseCatalog;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
}) {
  const [faceId, setFaceId] = useState<GlossaryBaseFaceId>('guard-control');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useMemo(() => countCardsByFace(catalog.cards), [catalog.cards]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cardsForFace(catalog.cards, faceId).filter((card) => {
      if (!needle) return true;
      if (card.title.toLowerCase().includes(needle)) return true;
      if (card.aliases.some((alias) => alias.toLowerCase().includes(needle))) return true;
      if (card.subFactor.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [catalog.cards, faceId, query]);

  return (
    <section className="tree-glossary" aria-label="Glossary base cards">
      <div className="tree-glossary__head">
        <h2>Glossary base cards</h2>
        <p className="tree-glossary__lead">
          {GLOSSARY_BASE_CARD_TOTAL} solo cards from the glossary, one for each term on six D8 faces.
          They start with no links. Your own trees stay separate, even when a name matches.
        </p>
      </div>
      <fieldset className="tree-glossary__faces">
        <legend>D8 face</legend>
        {GLOSSARY_BASE_FACE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={id === faceId ? 'tree-glossary__face is-on' : 'tree-glossary__face'}
            aria-pressed={id === faceId}
            onClick={() => {
              setFaceId(id);
              setOpenId(null);
              setQuery('');
            }}
          >
            {glossaryBaseFaceLabel(id)}
            <small>{counts[id]}</small>
          </button>
        ))}
      </fieldset>
      <label className="tree-glossary__find" htmlFor="tree-glossary-find">
        Find a card on this face
        <input
          id="tree-glossary-find"
          value={query}
          autoComplete="off"
          autoCapitalize="sentences"
          placeholder="Closed Guard"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {visible.length === 0 ? (
        <p className="tree-glossary__empty">No glossary cards on this face match that name.</p>
      ) : (
        <ul className="tree-glossary__list">
          {visible.map((card) => (
            <GlossaryCard
              key={card.id}
              card={card}
              catalog={catalog}
              open={openId === card.id}
              onToggle={() => setOpenId((current) => (current === card.id ? null : card.id))}
              onCatalogChange={onCatalogChange}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GlossaryCard({
  card,
  catalog,
  open,
  onToggle,
  onCatalogChange,
}: {
  card: GlossaryBaseCard;
  catalog: GlossaryBaseCatalog;
  open: boolean;
  onToggle: () => void;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
}) {
  const collisions = catalog.collisions.filter((row) => row.glossaryTermId === card.glossaryTermId);
  const source: GlossaryBaseLinkSource = { type: 'card', cardId: card.id };
  const links = linksFrom(catalog, source);
  const titleId = `tree-gbase-${card.termKey}`;
  return (
    <li>
      <article className="tree-glossary__card" aria-labelledby={titleId}>
        <button type="button" className="tree-glossary__open" onClick={onToggle} aria-expanded={open}>
          <span className="tree-glossary__title" id={titleId}>
            {card.title}
          </span>
          <span className="tree-chip tree-chip--base">{glossaryBaseFaceLabel(card.faceId)}</span>
        </button>
        {open ? (
          <>
            {card.aliases.length ? (
              <p className="tree-glossary__aliases">Also called {card.aliases.join(', ')}</p>
            ) : null}
            {card.definition ? <p className="tree-glossary__definition">{card.definition}</p> : null}
            {card.subFactor ? <p className="tree-glossary__meta">{card.subFactor}</p> : null}
            {collisions.map((row) => (
              <p key={`${row.treeId}-${row.nodeId}`} className="tree-glossary__collision">
                A step named {row.nodeTitle} already exists in {row.treeName}. This glossary card stays
                separate.
              </p>
            ))}
            <TreeConnectField
              catalog={catalog}
              from={source}
              blockedIds={[card.glossaryTermId]}
              onCatalogChange={onCatalogChange}
            />
            <GlossaryLinkList catalog={catalog} links={links} onCatalogChange={onCatalogChange} />
          </>
        ) : null}
      </article>
    </li>
  );
}

export function GlossaryLinkList({
  catalog,
  links,
  onCatalogChange,
}: {
  catalog: GlossaryBaseCatalog;
  links: readonly GlossaryBaseLink[];
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
}) {
  if (!links.length) return null;
  return (
    <ul className="tree-glossary__links" aria-label="Links from this card">
      {links.map((link) => {
        const target = findBaseCard(catalog, link.toCardId);
        const name = target?.title ?? 'a removed card';
        return (
          <li key={link.id}>
            <span>
              {link.relation} {name}
              {link.label ? ` · ${link.label}` : ''}
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onCatalogChange(removeGlossaryBaseLink(catalog, link.id))}
            >
              Unlink
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TreeConnectField({
  catalog,
  from,
  blockedIds = [],
  onCatalogChange,
}: {
  catalog: GlossaryBaseCatalog;
  from: GlossaryBaseLinkSource;
  blockedIds?: readonly string[];
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const node = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [caret, setCaret] = useState(0);
  const [hiddenQuery, setHiddenQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [status, setStatus] = useState('');
  const blocked = useMemo(() => [...EXCLUDED_TERM_IDS, ...blockedIds], [blockedIds]);
  const suggestion = useGlossarySuggest(value, caret, blocked);
  const visible = suggestion && suggestion.query !== hiddenQuery ? suggestion : null;
  const span = glossaryQuerySpans(value, caret)[0];
  const pendingQuery = span && span.query.length >= GLOSSARY_MIN_CHARS ? span.query : '';

  useEffect(() => {
    setReady(false);
    if (!pendingQuery) return;
    const handle = window.setTimeout(() => setReady(true), GLOSSARY_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [pendingQuery, caret, value]);

  useEffect(() => {
    setActive(0);
  }, [visible?.query, visible?.matches.length]);

  useEffect(() => {
    if (!visible && !pendingQuery) return;
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
  }, [visible, pendingQuery]);

  const empty = ready && !!pendingQuery && !visible;
  const panel = visible || empty;

  const pick = (match: GlossaryMatch) => {
    const result = pickGlossaryBaseSuggestion(catalog, from, match, 'branch');
    if (result.status === 'linked' && result.card) {
      onCatalogChange(result.catalog);
      setStatus(`Linked to ${result.card.title}.`);
    } else if (result.status === 'already' && result.card) {
      setStatus(`Already linked to ${result.card.title}.`);
    } else if (result.status === 'same-card') {
      setStatus('That is the same card.');
    } else {
      setStatus('No glossary base card for that term. Nothing was added.');
    }
    setValue('');
    setCaret(0);
    setHiddenQuery(null);
    window.requestAnimationFrame(() => node.current?.focus({ preventScroll: true }));
  };

  const dismiss = () => {
    setHiddenQuery(visible?.query ?? pendingQuery ?? hiddenQuery);
    setStatus('');
  };

  const syncCaret = (target: HTMLInputElement) => setCaret(target.selectionStart ?? target.value.length);

  return (
    <div className="tree-connect">
      <label className="tree-connect__label" htmlFor={inputId}>
        Connect to
      </label>
      <input
        id={inputId}
        ref={node}
        value={value}
        autoComplete="off"
        autoCapitalize="sentences"
        placeholder="Triangle choke"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={panel ? true : false}
        aria-controls={listId}
        aria-activedescendant={visible ? `${listId}-${visible.matches[Math.min(active, visible.matches.length - 1)]?.term.id}` : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          syncCaret(event.target);
          setHiddenQuery(null);
          setStatus('');
        }}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && panel) {
            event.preventDefault();
            dismiss();
            return;
          }
          if (!visible) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (current + 1) % visible.matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (current - 1 + visible.matches.length) % visible.matches.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const match = visible.matches[Math.min(active, visible.matches.length - 1)];
            if (match) pick(match);
          }
        }}
      />
      {panel ? (
        <div
          className={keyboardInset > 0 ? 'tree-connect__panel tree-connect__panel--keyboard' : 'tree-connect__panel'}
          style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
        >
          {visible ? (
            <div className="tree-connect__suggest" id={listId} role="listbox" aria-label="Matching glossary terms">
              {visible.matches.map((match, index) => (
                <button
                  key={match.term.id}
                  id={`${listId}-${match.term.id}`}
                  type="button"
                  className={index === active ? 'tree-connect__option is-active' : 'tree-connect__option'}
                  role="option"
                  aria-selected={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => pick(match)}
                >
                  <span>{match.term.name}</span>
                  <small>
                    {glossaryFaceLabel(match.term.faceId)}
                    {match.via === 'alias' ? ` · also called ${match.matchedOn}` : ''}
                    {match.via === 'fuzzy' ? ' · close spelling' : ''}
                  </small>
                </button>
              ))}
              <button
                type="button"
                className="tree-connect__dismiss"
                aria-label="Dismiss suggestions"
                onPointerDown={(event) => event.preventDefault()}
                onClick={dismiss}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <p className="tree-connect__empty" id={listId} role="status">
              No matching glossary terms.
            </p>
          )}
        </div>
      ) : null}
      {status ? (
        <p className="tree-glossary__meta" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
