import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGlossarySuggest } from '../glossary/useGlossarySuggest.ts';
import {
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
import { connectionsForIdentity, type IdentityConnection, type NamedEdge } from '../lib/d8TreeLinks.ts';
import { stepIdentity, type StepLike } from '../lib/moveIdentity.ts';
import type { TechniqueNode, TechniqueTreeArchive } from '../lib/techniqueTreeStore.ts';
import './techniqueTreeGlossary.css';

export function GlossaryBaseCardsPanel({
  catalog,
  onCatalogChange,
  view,
  onViewChange,
  onShowOnDiamond,
  archive = null,
  edges = [],
  onOpenStep,
}: {
  catalog: GlossaryBaseCatalog;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
  view?: GlossaryPanelView;
  onViewChange?: (view: GlossaryPanelView) => void;
  onShowOnDiamond?: (faceId: GlossaryBaseFaceId, cardId: string) => void;
  /** The coach's trees, so a card can list the steps that are this move. */
  archive?: TechniqueTreeArchive | null;
  /** Every saved link (trees, glossary links, D8 card connections). */
  edges?: readonly NamedEdge[];
  onOpenStep?: (treeId: string, nodeId: string) => void;
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
          {GLOSSARY_BASE_CARD_TOTAL} cards from the glossary, one for each term on all eight D8 faces. A
          tree step with the same name or a glossary alias is the same move, so its links show here, on
          your D8 card, and in your trees. Link a step to a different card, or unlink it, from the step.
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
              archive={archive}
              edges={edges}
              onOpenStep={onOpenStep}
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
  archive,
  edges,
  onOpenStep,
}: {
  card: GlossaryBaseCard;
  catalog: GlossaryBaseCatalog;
  open: boolean;
  onToggle: () => void;
  onOpenCard: (cardId: string) => void;
  onShowOnDiamond?: (faceId: GlossaryBaseFaceId, cardId: string) => void;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
  archive: TechniqueTreeArchive | null;
  edges: readonly NamedEdge[];
  onOpenStep?: (treeId: string, nodeId: string) => void;
}) {
  const steps = open ? stepsForCard(archive, card.id) : [];
  const treeName = (id: string) => archive?.trees.find((tree) => tree.id === id)?.name ?? null;
  const elsewhere = open
    ? connectionsForIdentity({ cardId: card.id, name: card.title }, edges, {
        // Links saved on this card are listed below with Unlink.
        skip: (edge) => edge.source === 'glossary' && (!edge.treeId || edge.toCard === card.id),
      })
    : [];
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
            {steps.length ? (
              <ul className="tree-glossary__links tree-ident__steps" data-testid="tree-glossary-steps" aria-label="Tree steps that are this move">
                {steps.map((row) => (
                  <li key={`${row.treeId}-${row.node.id}`} data-how={row.how}>
                    {onOpenStep ? (
                      <button type="button" className="tree-glossary__link" onClick={() => onOpenStep(row.treeId, row.node.id)}>
                        Step {row.node.title || 'Untitled'} in {row.treeName}
                      </button>
                    ) : (
                      <span>
                        Step {row.node.title || 'Untitled'} in {row.treeName}
                      </span>
                    )}
                    <small className="tree-ident__source">{row.how === 'linked' ? 'linked by you' : 'same name'}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            <IdentityConnections
              rows={elsewhere}
              treeName={treeName}
              onOpenCard={onOpenCard}
              testId="tree-glossary-elsewhere"
              label="From your trees and D8 cards"
            />
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
  const blocked = useMemo(() => [...blockedIds], [blockedIds]);
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

const STEP_PICK_MAX = 8;

/** Glossary cards whose name or alias contains every word typed. */
export function searchGlossaryCards(catalog: GlossaryBaseCatalog, query: string, max = STEP_PICK_MAX): GlossaryBaseCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (text: string) => {
    const lower = text.toLowerCase();
    return words.every((word) => lower.includes(word));
  };
  const exact: GlossaryBaseCard[] = [];
  const rest: GlossaryBaseCard[] = [];
  for (const card of catalog.cards) {
    if (hit(card.title)) exact.push(card);
    else if (card.aliases.some(hit)) rest.push(card);
    if (exact.length >= max) break;
  }
  return [...exact, ...rest].slice(0, max);
}

const DIRECTION_TEXT: Record<IdentityConnection['direction'], string> = {
  leads: 'Leads to',
  from: 'Comes from',
  defense: 'Defended by',
  counters: 'Defends',
};

function sourceText(row: IdentityConnection, treeName: (id: string) => string | null): string {
  if (row.source === 'card') return 'D8 card';
  if (row.source === 'glossary') return row.treeId ? `Glossary link from ${treeName(row.treeId) ?? 'a tree'}` : 'Glossary card';
  return row.treeId ? `Tree: ${treeName(row.treeId) ?? 'another tree'}` : 'Tree';
}

/** Connections for one move from every place they were added. Read-only; remove them where they were made. */
export function IdentityConnections({
  rows,
  treeName,
  onOpenCard,
  testId,
  label,
}: {
  rows: readonly IdentityConnection[];
  treeName: (id: string) => string | null;
  onOpenCard?: (cardId: string) => void;
  testId: string;
  label: string;
}) {
  if (!rows.length) return null;
  return (
    <div className="tree-ident__elsewhere">
      <p className="tree-ident__heading">{label}</p>
      <ul className="tree-glossary__links" data-testid={testId} aria-label={label}>
        {rows.map((row) => (
          <li key={`${row.direction}-${row.cardId ?? row.name}-${row.source}`} data-direction={row.direction} data-source={row.source}>
            {row.cardId && onOpenCard ? (
              <button type="button" className="tree-glossary__link" onClick={() => onOpenCard(row.cardId!)}>
                {DIRECTION_TEXT[row.direction]} {row.name}
              </button>
            ) : (
              <span>
                {DIRECTION_TEXT[row.direction]} {row.name}
              </span>
            )}
            <small className="tree-ident__source">{sourceText(row, treeName)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The glossary card a tree step is. Matched by name or alias on its own;
 * the coach can link a different card by hand, or unlink it.
 */
export function StepGlossaryLink({
  step,
  catalog,
  onLink,
  onOpenCard,
}: {
  step: StepLike & { id: string };
  catalog: GlossaryBaseCatalog;
  onLink: (cardId: string | null | undefined) => void;
  onOpenCard?: (cardId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const inputId = useId();
  const identity = stepIdentity(step);
  const card = identity.cardId ? findBaseCard(catalog, identity.cardId) : null;
  const options = useMemo(() => searchGlossaryCards(catalog, query), [catalog, query]);
  return (
    <div className="tree-ident" data-testid="tree-step-identity" data-how={identity.how} data-card-id={card?.id ?? ''}>
      {card ? (
        <p className="tree-ident__line">
          <span className="tree-chip tree-chip--glossary">Glossary</span>
          {onOpenCard ? (
            <button type="button" className="tree-glossary__link" data-testid="tree-step-open-card" onClick={() => onOpenCard(card.id)}>
              {card.title}
            </button>
          ) : (
            <span>{card.title}</span>
          )}
          <small>{identity.how === 'linked' ? 'linked by you' : 'same name'}</small>
        </p>
      ) : (
        <p className="tree-ident__line">
          <span className="tree-chip">Glossary</span>
          <span>{identity.how === 'unlinked' ? 'Unlinked by you' : 'Not linked to a glossary card'}</span>
        </p>
      )}
      <div className="tree-ident__actions">
        <button
          type="button"
          className="btn btn--ghost"
          data-testid="tree-step-link"
          aria-expanded={picking}
          onClick={() => {
            setPicking((open) => !open);
            setQuery('');
          }}
        >
          {card ? 'Change glossary card' : 'Link to glossary card'}
        </button>
        {card ? (
          <button type="button" className="btn btn--ghost" data-testid="tree-step-unlink" onClick={() => onLink(null)}>
            Unlink
          </button>
        ) : null}
        {identity.how === 'unlinked' || identity.how === 'linked' ? (
          <button type="button" className="btn btn--ghost" data-testid="tree-step-auto" onClick={() => onLink(undefined)}>
            Match by name
          </button>
        ) : null}
      </div>
      {picking ? (
        <div className="tree-ident__pick">
          <label className="tree-connect__label" htmlFor={inputId}>
            Find a glossary card
          </label>
          <input
            id={inputId}
            data-testid="tree-step-link-search"
            value={query}
            autoComplete="off"
            autoCapitalize="sentences"
            placeholder="Closed guard"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() ? (
            options.length ? (
              <ul className="tree-ident__options" data-testid="tree-step-link-options">
                {options.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className="tree-connect__option"
                      data-card-id={option.id}
                      onClick={() => {
                        onLink(option.id);
                        setPicking(false);
                        setQuery('');
                      }}
                    >
                      <span>{option.title}</span>
                      <small>{glossaryBaseFaceLabel(option.faceId)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tree-ident__empty">No glossary card matches that name.</p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Tree steps that are this glossary card, by name, alias, or a link the coach made. */
export function stepsForCard(
  archive: TechniqueTreeArchive | null | undefined,
  cardId: string,
): { treeId: string; treeName: string; node: TechniqueNode; how: 'linked' | 'auto' }[] {
  const out: { treeId: string; treeName: string; node: TechniqueNode; how: 'linked' | 'auto' }[] = [];
  for (const tree of archive?.trees ?? []) {
    const visit = (node: TechniqueNode | null) => {
      if (!node) return;
      const identity = stepIdentity(node);
      if (identity.cardId === cardId && (identity.how === 'linked' || identity.how === 'auto')) {
        out.push({ treeId: tree.id, treeName: tree.name, node, how: identity.how });
      }
      node.children.forEach(visit);
    };
    visit(tree.root);
  }
  return out;
}
