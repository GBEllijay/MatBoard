import { useMemo, useState } from 'react';
import {
  GLOSSARY_BASE_CARD_TOTAL,
  GLOSSARY_BASE_FACE_IDS,
  cardsForFace,
  countCardsByFace,
  glossaryBaseFaceLabel,
  type GlossaryBaseCard,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
} from '../lib/glossaryBaseCards.ts';
import './techniqueTreeGlossary.css';

export function GlossaryBaseCardsPanel({ catalog }: { catalog: GlossaryBaseCatalog }) {
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
}: {
  card: GlossaryBaseCard;
  catalog: GlossaryBaseCatalog;
  open: boolean;
  onToggle: () => void;
}) {
  const collisions = catalog.collisions.filter((row) => row.glossaryTermId === card.glossaryTermId);
  const titleId = `tree-gbase-${card.termKey}`;
  return (
    <li>
      <article className="tree-glossary__card" aria-labelledby={titleId}>
        <button type="button" className="tree-glossary__open" onClick={onToggle} aria-expanded={open}>
          <span>
            <span className="tree-glossary__title" id={titleId}>
              {card.title}
            </span>
            {card.aliases.length ? (
              <span className="tree-glossary__aliases">Also called {card.aliases.join(', ')}</span>
            ) : null}
          </span>
          <span className="tree-chip tree-chip--base">{glossaryBaseFaceLabel(card.faceId)}</span>
        </button>
        {open ? (
          <>
            {card.definition ? <p className="tree-glossary__definition">{card.definition}</p> : null}
            {card.subFactor ? <p className="tree-glossary__meta">{card.subFactor}</p> : null}
            {collisions.map((row) => (
              <p key={`${row.treeId}-${row.nodeId}`} className="tree-glossary__collision">
                A step named {row.nodeTitle} already exists in {row.treeName}. This glossary card stays
                separate.
              </p>
            ))}
          </>
        ) : null}
      </article>
    </li>
  );
}
