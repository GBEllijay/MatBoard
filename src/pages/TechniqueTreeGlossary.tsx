import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGlossarySuggest } from '../glossary/useGlossarySuggest.ts';
import { GLOSSARY } from '../lib/glossary.ts';
import {
  EXCLUDED_GLOSSARY_FACES,
  GLOSSARY_BASE_CARD_TOTAL,
  GLOSSARY_BASE_FACE_IDS,
  cardsForFace,
  countCardsByFace,
  emptyGlossaryPanelView,
  findBaseCard,
  glossaryBaseFaceLabel,
  isGlossaryBaseFace,
  linksFrom,
  linksTo,
  linkSourceLabel,
  pickGlossaryBaseSuggestion,
  removeGlossaryBaseLink,
  viewForCard,
  viewForFace,
  type GlossaryBaseCard,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
  type GlossaryBaseLink,
  type GlossaryBaseLinkSource,
  type GlossaryPanelView,
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
  view,
  onViewChange,
  onShowOnDiamond,
}: {
  catalog: GlossaryBaseCatalog;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
  view?: GlossaryPanelView;
  onViewChange?: (view: GlossaryPanelView) => void;
  onShowOnDiamond?: (faceId: GlossaryBaseFaceId, cardId: string) => void;
}) {
  const [internal, setInternal] = useState<GlossaryPanelView>(emptyGlossaryPanelView());
  const current = view ?? internal;
  const setCurrent = (next: GlossaryPanelView) => {
    if (view === undefined) setInternal(next);
    onViewChange?.(next);
  };
  const counts = useMemo(() => countCardsByFace(catalog.cards), [catalog.cards]);
  const visible = useMemo(() => {
    const needle = current.query.trim().toLowerCase();
    return cardsForFace(catalog.cards, current.faceId).filter((card) => {
      if (!needle) return true;
      if (card.title.toLowerCase().includes(needle)) return true;
      if (card.aliases.some((alias) => alias.toLowerCase().includes(needle))) return true;
      if (card.subFactor.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [catalog.cards, current.faceId, current.query]);
  const trailCards = current.trail
    .map((id) => findBaseCard(catalog, id))
    .filter((card): card is GlossaryBaseCard => !!card);

  useEffect(() => {
    if (!current.openId) return;
    document.getElementById(`tree-gbase-card-${current.openId}`)?.scrollIntoView({ block: 'nearest' });
  }, [current.openId, current.faceId]);

  const openCard = (cardId: string) => setCurrent(viewForCard(catalog, cardId, current));

  return (
    <section className="tree-glossary" id="tree-glossary-panel" aria-label="Glossary base cards">
      <div className="tree-glossary__head">
        <h2>Glossary base cards</h2>
        <p className="tree-glossary__lead">
          {GLOSSARY_BASE_CARD_TOTAL} solo cards from the glossary, one for each term on six D8 faces.
          They start with no links. Tap a link to open that card and add the next connection. Your own
          trees stay separate, even when a name matches.
        </p>
      </div>
      {trailCards.length > 1 ? (
        <nav className="tree-glossary__trail" aria-label="Path through linked cards" data-testid="tree-glossary-trail">
          {trailCards.map((card, index) => (
            <span key={`${card.id}-${index}`}>
              {index > 0 ? <span className="tree-glossary__trail-sep" aria-hidden="true">›</span> : null}
              {index === trailCards.length - 1 ? (
                <span>{card.title}</span>
              ) : (
                <button type="button" onClick={() => openCard(card.id)}>
                  {card.title}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <fieldset className="tree-glossary__faces">
        <legend>D8 face</legend>
        {GLOSSARY_BASE_FACE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={id === current.faceId ? 'tree-glossary__face is-on' : 'tree-glossary__face'}
            aria-pressed={id === current.faceId}
            onClick={() => setCurrent(viewForFace(id))}
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
          value={current.query}
          autoComplete="off"
          autoCapitalize="sentences"
          placeholder="Closed Guard"
          onChange={(event) => setCurrent({ ...current, query: event.target.value })}
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
              open={current.openId === card.id}
              onToggle={() =>
                setCurrent(
                  current.openId === card.id
                    ? { ...current, openId: null }
                    : viewForCard(catalog, card.id, { ...current, openId: null, trail: [] }),
                )
              }
              onOpenCard={openCard}
              onShowOnDiamond={onShowOnDiamond}
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
  onOpenCard,
  onShowOnDiamond,
  onCatalogChange,
}: {
  card: GlossaryBaseCard;
  catalog: GlossaryBaseCatalog;
  open: boolean;
  onToggle: () => void;
  onOpenCard: (cardId: string) => void;
  onShowOnDiamond?: (faceId: GlossaryBaseFaceId, cardId: string) => void;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
}) {
  const collisions = catalog.collisions.filter((row) => row.glossaryTermId === card.glossaryTermId);
  const source: GlossaryBaseLinkSource = { type: 'card', cardId: card.id };
  const links = linksFrom(catalog, source);
  const incoming = linksTo(catalog, card.id);
  const titleId = `tree-gbase-${card.termKey}`;
  return (
    <li>
      <article
        className={open ? 'tree-glossary__card is-focus' : 'tree-glossary__card'}
        aria-labelledby={titleId}
        id={`tree-gbase-card-${card.id}`}
        data-card-id={card.id}
        data-face-id={card.faceId}
      >
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
            {onShowOnDiamond && isGlossaryBaseFace(card.faceId) ? (
              <button
                type="button"
                className="btn btn--ghost tree-glossary__on-diamond"
                data-testid="tree-glossary-on-diamond"
                onClick={() => onShowOnDiamond(card.faceId, card.id)}
              >
                Show on the D8 Shape
              </button>
            ) : null}
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
            <GlossaryIncomingList catalog={catalog} links={incoming} onOpenCard={onOpenCard} />
            <GlossaryLinkList catalog={catalog} links={links} onCatalogChange={onCatalogChange} onOpenCard={onOpenCard} />
          </>
        ) : null}
      </article>
    </li>
  );
}

function GlossaryIncomingList({
  catalog,
  links,
  onOpenCard,
}: {
  catalog: GlossaryBaseCatalog;
  links: readonly GlossaryBaseLink[];
  onOpenCard?: (cardId: string) => void;
}) {
  if (!links.length) return null;
  return (
    <ul className="tree-glossary__links tree-glossary__links--in" aria-label="Comes from" data-testid="tree-glossary-comes-from">
      {links.map((link) => {
        const name = linkSourceLabel(catalog, link.from);
        const fromId = link.from.type === 'card' ? link.from.cardId : null;
        return (
          <li key={link.id}>
            {fromId && onOpenCard ? (
              <button type="button" className="tree-glossary__link" onClick={() => onOpenCard(fromId)}>
                Comes from {name}
              </button>
            ) : (
              <span>Comes from {name}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function GlossaryLinkList({
  catalog,
  links,
  onCatalogChange,
  onOpenCard,
}: {
  catalog: GlossaryBaseCatalog;
  links: readonly GlossaryBaseLink[];
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
  onOpenCard?: (cardId: string) => void;
}) {
  if (!links.length) return null;
  return (
    <ul className="tree-glossary__links" aria-label="Links from this card">
      {links.map((link) => {
        const target = findBaseCard(catalog, link.toCardId);
        const name = target?.title ?? 'a removed card';
        return (
          <li key={link.id}>
            {target && onOpenCard ? (
              <button
                type="button"
                className="tree-glossary__link"
                data-testid="tree-glossary-branch"
                onClick={() => onOpenCard(target.id)}
              >
                {link.relation} {name}
                {link.label ? ` · ${link.label}` : ''}
              </button>
            ) : (
              <span>
                {link.relation} {name}
                {link.label ? ` · ${link.label}` : ''}
              </span>
            )}
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
