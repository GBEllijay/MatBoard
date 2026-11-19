import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  GLOSSARY_BASE_FACE_IDS,
  GLOSSARY_BASE_STORAGE_KEY,
  glossaryBaseFaceLabel,
  loadGlossaryBaseCatalog,
  saveGlossaryBaseCatalog,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
} from '../lib/glossaryBaseCards';
import {
  addLessonTechniqueToGlossary,
  canOfferAddToGlossary,
  lessonGlossaryHref,
  lessonGlossaryMatch,
} from '../lib/lessonGlossary';
import { noteLocalTreeChange } from '../lib/syncTrigger';
import { TREE_CLOUD_EVENT } from '../lib/techniqueTreeCloud';
import './lessonGlossary.css';

/** Fired after the lesson plan adds a card to the glossary, so every drill on the page re-reads it. */
export const LESSON_GLOSSARY_EVENT = 'matboard:lesson-glossary';

let cached: GlossaryBaseCatalog | null = null;

function readCatalog(): GlossaryBaseCatalog {
  if (!cached) cached = loadGlossaryBaseCatalog();
  return cached;
}

function subscribe(listener: () => void): () => void {
  const refresh = () => {
    cached = null;
    listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === GLOSSARY_BASE_STORAGE_KEY) refresh();
  };
  window.addEventListener(LESSON_GLOSSARY_EVENT, refresh);
  window.addEventListener(TREE_CLOUD_EVENT, refresh);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LESSON_GLOSSARY_EVENT, refresh);
    window.removeEventListener(TREE_CLOUD_EVENT, refresh);
    window.removeEventListener('storage', onStorage);
  };
}

/** The coach's glossary cards (built-in plus any they added), live across every drill on the page. */
export function useLessonGlossaryCatalog(): GlossaryBaseCatalog {
  return useSyncExternalStore(subscribe, readCatalog, readCatalog);
}

/** Link from a class lesson to the overall glossary. */
export function LessonGlossaryLink({ to, label = 'Open the glossary' }: { to: string; label?: string }) {
  return (
    <Link className="lesson-glossary__all" to={to} data-testid="lesson-glossary-all">
      <span aria-hidden="true">📖</span> {label}
    </Link>
  );
}

/**
 * Under a drill title: the glossary card that title is, or "Add to glossary"
 * when it is not in the glossary yet. Read-only days show the card only.
 */
export function LessonGlossaryCard({
  techId,
  title,
  glossaryCardId,
  readOnly,
  onConnect,
  hrefFor = lessonGlossaryHref,
}: {
  techId: string;
  title: string;
  glossaryCardId?: string;
  readOnly: boolean;
  onConnect: (glossaryCardId: string | undefined) => void;
  /** Builds the glossary link (lets the page carry its hub query). */
  hrefFor?: (cardId?: string | null) => string;
}) {
  const catalog = useLessonGlossaryCatalog();
  const match = lessonGlossaryMatch({ title, glossaryCardId }, catalog);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(title.trim());
  const [faceId, setFaceId] = useState<GlossaryBaseFaceId>('guard-control');
  const [definition, setDefinition] = useState('');
  const [note, setNote] = useState('');
  const formId = useId();

  useEffect(() => {
    if (!adding) setName(title.trim());
  }, [title, adding]);

  const card = match.card;
  if (card) {
    return (
      <div className="lesson-glossary" data-testid="lesson-glossary-card" data-card-id={card.id} data-how={match.how}>
        <button
          type="button"
          className={open ? 'lesson-glossary__chip is-open' : 'lesson-glossary__chip'}
          aria-expanded={open}
          aria-controls={`lesson-glossary-body-${techId}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="lesson-glossary__kicker">Glossary</span>
          <span className="lesson-glossary__title">{card.title}</span>
          <span className="tree-chip tree-chip--base">{glossaryBaseFaceLabel(card.faceId)}</span>
          {card.custom ? <span className="lesson-glossary__mine">Added by you</span> : null}
        </button>
        {open ? (
          <div className="lesson-glossary__body" id={`lesson-glossary-body-${techId}`}>
            {card.aliases.length ? <p className="lesson-glossary__aliases">Also called {card.aliases.join(', ')}</p> : null}
            {card.definition ? (
              <p className="lesson-glossary__definition">{card.definition}</p>
            ) : (
              <p className="lesson-glossary__definition lesson-glossary__definition--empty">No definition yet.</p>
            )}
            {card.subFactor ? <p className="lesson-glossary__meta">{card.subFactor}</p> : null}
            <div className="lesson-glossary__actions">
              <Link className="btn btn--ghost lesson-glossary__open" to={hrefFor(card.id)}>
                Open this card in the glossary
              </Link>
              {match.how === 'linked' && !readOnly ? (
                <button type="button" className="btn btn--ghost" onClick={() => onConnect(undefined)}>
                  Disconnect
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (readOnly || !canOfferAddToGlossary({ title, glossaryCardId }, catalog)) return null;

  if (!adding) {
    return (
      <div className="lesson-glossary lesson-glossary--missing" data-testid="lesson-glossary-missing">
        <span className="lesson-glossary__hint">Not in the glossary yet.</span>
        <button
          type="button"
          className="btn btn--ghost lesson-glossary__add"
          onClick={() => {
            setName(title.trim());
            setNote('');
            setAdding(true);
          }}
        >
          Add “{title.trim()}” to the glossary
        </button>
      </div>
    );
  }

  const save = () => {
    const result = addLessonTechniqueToGlossary(readCatalog(), { title: name, faceId, definition });
    if (!result.patch) {
      setNote(result.status === 'full' ? 'Your glossary is full on this device.' : 'Give the move a name first.');
      return;
    }
    if (result.status === 'added') {
      const saved = saveGlossaryBaseCatalog(result.catalog);
      if (!saved.saved) {
        setNote(saved.quota ? 'This device is out of storage, so the card was not saved.' : 'Could not save the card on this device.');
        return;
      }
      noteLocalTreeChange();
    }
    cached = null;
    window.dispatchEvent(new Event(LESSON_GLOSSARY_EVENT));
    onConnect(result.patch.glossaryCardId);
    setAdding(false);
    setOpen(true);
  };

  return (
    <form
      className="lesson-glossary lesson-glossary__form"
      data-testid="lesson-glossary-add-form"
      aria-label="Add to glossary"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label htmlFor={`${formId}-name`}>
        Name
        <input
          id={`${formId}-name`}
          value={name}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label htmlFor={`${formId}-face`}>
        D8 face
        <select id={`${formId}-face`} value={faceId} onChange={(event) => setFaceId(event.target.value as GlossaryBaseFaceId)}>
          {GLOSSARY_BASE_FACE_IDS.map((id) => (
            <option key={id} value={id}>
              {glossaryBaseFaceLabel(id)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${formId}-def`}>
        Short definition (optional)
        <textarea
          id={`${formId}-def`}
          value={definition}
          rows={2}
          maxLength={600}
          onChange={(event) => setDefinition(event.target.value)}
        />
      </label>
      {note ? (
        <p className="lesson-glossary__note" role="status">
          {note}
        </p>
      ) : null}
      <div className="lesson-glossary__actions">
        <button type="submit" className="btn">
          Add and connect
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
