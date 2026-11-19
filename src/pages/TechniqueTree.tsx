import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useRosterState } from '../hooks/useStores';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { gamePlanMentionIndex, mentionText, mentionsForNode, type GamePlanMention } from '../lib/gamePlan';
import { TECHNIQUE_TREE_CAP_NOTE, TECHNIQUE_TREE_LABEL, TECHNIQUE_TREE_LEAD } from '../lib/coachCopy';
import { DEVICE_STORAGE_FULL_NOTE } from '../lib/storageQuota';
import type { ShareChoice, SharePreview } from '../lib/techniqueShare';
import {
  applyCoachImport,
  downloadTechniqueShare,
  previewCoachImport,
  readTechniqueShare,
  shareFromCoachTree,
} from '../lib/techniqueShare';
import {
  MAX_TREE_NODES,
  MAX_TREES,
  NOTES_MAX,
  TITLE_MAX,
  TREE_NAME_MAX,
  activeTree,
  addChild,
  addTree,
  canAddChild,
  countNodes,
  deleteTree,
  descendantCount,
  findNode,
  loadTechniqueArchive,
  removeNode,
  revealNode,
  renameTree,
  saveTechniqueArchive,
  selectTree,
  setNodeGlossaryCard,
  setRoot,
  TECHNIQUE_TREE_STORAGE_KEY,
  toggleCollapsed,
  updateActive,
  updateNode,
  type TechniqueNode,
  type TechniqueTreeArchive,
  type TechniqueTreeDoc,
  type TreeChildKind,
} from '../lib/techniqueTreeStore';
import {
  emptyGlossaryPanelView,
  ensureGlossaryBaseCards,
  GLOSSARY_BASE_STORAGE_KEY,
  linksFrom,
  saveGlossaryBaseCatalog,
  viewForCard,
  viewForFace,
  type GlossaryBaseCatalog,
  type GlossaryPanelView,
} from '../lib/glossaryBaseCards';
import { TechniqueTreeDiamond } from './TechniqueTreeDiamond';
import {
  GlossaryBaseCardsPanel,
  GlossaryLinkList,
  IdentityConnections,
  StepGlossaryLink,
  TreeConnectField,
} from './TechniqueTreeGlossary';
import {
  connectionsForIdentity,
  edgesFromArchive,
  edgesFromCards,
  edgesFromCatalog,
  type NamedEdge,
} from '../lib/d8TreeLinks';
import { stepIdentity, stepIdentityName } from '../lib/moveIdentity';
import { TREE_CLOUD_EVENT } from '../lib/techniqueTreeCloud';
import { useIndexCardFile, useLiveCards } from '../indexCards/store';

export function TechniqueTreePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const parent = useToolboxParent();
  const exitPath = useSubmenuBack() ?? '/coach';
  useCoachPageSwipe();
  const requestedTreeId = searchParams.get('tree');
  const requestedNodeId = searchParams.get('node');
  /** A glossary card id from an index card's "Open in Technique Tree". */
  const requestedCardId = searchParams.get('card');
  const roster = useRosterState();
  const mentionIndex = useMemo(
    () => gamePlanMentionIndex(roster.students, roster.gamePlans),
    [roster],
  );
  const [archive, setArchive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());
  const [glossaryCatalog, setGlossaryCatalog] = useState<GlossaryBaseCatalog>(
    () => ensureGlossaryBaseCards(loadTechniqueArchive()).catalog,
  );
  const [glossaryView, setGlossaryView] = useState<GlossaryPanelView>(emptyGlossaryPanelView);
  const doc = activeTree(archive);
  const [note, setNote] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDeleteTree, setConfirmDeleteTree] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [name, setName] = useState(doc.name);
  const [incoming, setIncoming] = useState<SharePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, ShareChoice>>({});
  const nameFocused = useRef(false);

  useEffect(() => {
    if (!nameFocused.current) setName(doc.name);
  }, [doc.name]);

  useEffect(() => {
    setGlossaryCatalog(ensureGlossaryBaseCards(archive).catalog);
  }, [archive]);

  // A signed-in sync wrote a newer cloud copy of the trees onto this device.
  useEffect(() => {
    const reload = () => setArchive(loadTechniqueArchive());
    const onStorage = (event: StorageEvent) => {
      if (event.key === TECHNIQUE_TREE_STORAGE_KEY || event.key === GLOSSARY_BASE_STORAGE_KEY) reload();
    };
    window.addEventListener(TREE_CLOUD_EVENT, reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TREE_CLOUD_EVENT, reload);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // One identity per move: tree steps, glossary cards, and D8 cards share links.
  const cardFile = useIndexCardFile();
  const liveCards = useLiveCards();
  const liveCardsKey = liveCards.map((card) => `${card.id}:${card.name}`).join('|');
  const allEdges = useMemo<NamedEdge[]>(
    () => [...edgesFromCards(cardFile, liveCards), ...edgesFromArchive(archive), ...edgesFromCatalog(glossaryCatalog, archive)],
    [cardFile, liveCardsKey, archive, glossaryCatalog],
  );
  const treeName = (id: string) => archive.trees.find((tree) => tree.id === id)?.name ?? null;

  useEffect(() => {
    if (!requestedTreeId) return;
    let cancelled = false;
    const current = loadTechniqueArchive();
    if (current.trees.some((tree) => tree.id === requestedTreeId) && current.activeId !== requestedTreeId) {
      const saved = saveTechniqueArchive(selectTree(current, requestedTreeId));
      if (!cancelled) {
        nameFocused.current = false;
        setArchive(saved.archive);
        setName(activeTree(saved.archive).name);
        setConfirmId(null);
        setConfirmDeleteTree(false);
        setFocusId(null);
      }
    }
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const next = new URLSearchParams(window.location.search);
      if (!next.has('tree')) return;
      next.delete('tree');
      setSearchParams(next, { replace: true });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requestedTreeId, setSearchParams]);

  useEffect(() => {
    if (!requestedCardId) return;
    const view = viewForCard(glossaryCatalog, requestedCardId);
    if (view.openId === requestedCardId) {
      setGlossaryView(view);
      window.requestAnimationFrame(() => {
        document.getElementById('tree-glossary-panel')?.scrollIntoView({ block: 'start' });
      });
    }
    const next = new URLSearchParams(window.location.search);
    next.delete('card');
    setSearchParams(next, { replace: true });
  }, [requestedCardId, glossaryCatalog, setSearchParams]);

  const commitArchive = (next: TechniqueTreeArchive) => {
    const saved = saveTechniqueArchive(next);
    setArchive(saved.archive);
    setNote(saved.saved ? '' : saved.quota ? DEVICE_STORAGE_FULL_NOTE : 'Could not save these trees on this device.');
    return saved.archive;
  };

  const commit = (next: TechniqueTreeDoc) => activeTree(commitArchive(updateActive(archive, next)));

  useEffect(() => {
    if (!requestedNodeId) return;
    const current = activeTree(archive);
    if (!current.root || !findNode(current.root, requestedNodeId)) return;
    const revealed = revealNode(current, requestedNodeId);
    if (revealed !== current) {
      commit(revealed);
      return;
    }
    const selector =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? `[data-node-id="${CSS.escape(requestedNodeId)}"]`
        : `[data-node-id="${requestedNodeId}"]`;
    document.querySelector(selector)?.scrollIntoView({ block: 'center' });
  }, [requestedNodeId, archive]);

  const setBase = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const saved = commit(setRoot(doc, title, draftNotes));
    setDraftTitle('');
    setDraftNotes('');
    if (saved.root) setFocusId(saved.root.id);
  };

  const onAdd = (parentId: string, kind: TreeChildKind) => {
    const added = addChild(doc, parentId, kind);
    if (!added.id) return;
    commit(added.doc);
    setFocusId(added.id);
    setConfirmId(null);
    setConfirmDeleteTree(false);
  };

  const onDelete = (node: TechniqueNode) => {
    if (descendantCount(node) > 0) {
      setConfirmDeleteTree(false);
      setConfirmId(node.id);
      return;
    }
    commit(removeNode(doc, node.id));
    setConfirmId(null);
  };

  const resetEditor = () => {
    nameFocused.current = false;
    setConfirmId(null);
    setConfirmDeleteTree(false);
    setFocusId(null);
    setDraftTitle('');
    setDraftNotes('');
  };

  const openTree = (id: string) => {
    if (id === doc.id) return;
    resetEditor();
    const saved = commitArchive(selectTree(archive, id));
    setName(activeTree(saved).name);
  };

  const onAddTree = () => {
    const result = addTree(archive);
    if (result.status === 'full') {
      setNote(TECHNIQUE_TREE_CAP_NOTE);
      return;
    }
    if (result.status !== 'added') return;
    resetEditor();
    const saved = commitArchive(result.archive);
    setName(activeTree(saved).name);
  };

  const onDeleteTree = () => {
    resetEditor();
    const saved = commitArchive(deleteTree(archive, doc.id));
    setName(activeTree(saved).name);
  };

  const steps = countNodes(doc.root);
  const full = steps >= MAX_TREE_NODES;
  const showLibrary = archive.trees.length > 1 || archive.trees.some((tree) => tree.root);
  const atCap = archive.trees.length >= MAX_TREES;

  return (
    <main className="tree">
      <PlayExitMark
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="tree__bar">
        <div className="tree__brand">
          <p className="tree__eyebrow">{parent.eyebrow}</p>
          <h1>{TECHNIQUE_TREE_LABEL}</h1>
          <p className="tree__subtitle">Technique Tree Training Tool</p>
        </div>
      </header>
      <p className="tree__lead">{TECHNIQUE_TREE_LEAD}</p>
      <div className="tree__library-actions">
        <button
          type="button"
          className="btn"
          disabled={!doc.root}
          onClick={() => downloadTechniqueShare(shareFromCoachTree(doc))}
        >
          Export this tree
        </button>
        <label className="btn">
          Import share file
          <input
            className="tree__file"
            type="file"
            accept="application/json,.json"
            aria-label="Import technique share file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void file.text().then((text) => {
                const read = readTechniqueShare(text);
                if (!read.ok) {
                  setNote(read.error);
                  setIncoming(null);
                  return;
                }
                setChoices({});
                setIncoming(previewCoachImport(doc, read.file));
                setNote('');
              });
            }}
          />
        </label>
      </div>
      {incoming ? (
        <section className="tree__confirm" aria-label="Review technique share">
          <p>
            Review {incoming.file.name}. Nothing changes until you accept. Notes on this device stay. Imported steps are not marked learned.
          </p>
          <p>
            {incoming.add.length} new, {incoming.unchanged.length} already here, {incoming.conflicts.length} need a choice.
          </p>
          <ul>
            {incoming.add.map((node) => (
              <li key={node.shareId}>Add {node.title}</li>
            ))}
            {incoming.conflicts.map((conflict) => {
              const chosen = choices[conflict.shareId] ?? (conflict.kind === 'title' ? 'keep' : 'skip');
              return (
                <li key={conflict.shareId}>
                  {conflict.kind === 'title'
                    ? `You call this ${conflict.localTitle}. The file calls it ${conflict.title}.`
                    : `${conflict.title} matches a technique already on this tree, with a different id.`}
                  {conflict.kind === 'title' ? (
                    <>
                      <button type="button" className="btn btn--ghost" aria-pressed={chosen === 'keep'} onClick={() => setChoices((current) => ({ ...current, [conflict.shareId]: 'keep' }))}>
                        Keep my title
                      </button>
                      <button type="button" className="btn btn--ghost" aria-pressed={chosen === 'take'} onClick={() => setChoices((current) => ({ ...current, [conflict.shareId]: 'take' }))}>
                        Use the file title
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn--ghost" aria-pressed={chosen === 'skip'} onClick={() => setChoices((current) => ({ ...current, [conflict.shareId]: 'skip' }))}>
                        Leave them separate
                      </button>
                      <button type="button" className="btn btn--ghost" aria-pressed={chosen === 'use-local'} onClick={() => setChoices((current) => ({ ...current, [conflict.shareId]: 'use-local' }))}>
                        Use the one already on this tree
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="tree__library-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                commit(applyCoachImport(doc, incoming.file, new Map(Object.entries(choices))));
                setIncoming(null);
                setNote(`Imported ${incoming.file.name}.`);
              }}
            >
              Accept import
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setIncoming(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
      {note ? (
        <p className="tree__status" role="status">
          {note}
        </p>
      ) : null}

      <TechniqueTreeDiamond
        catalog={glossaryCatalog}
        activeFaceId={glossaryView.faceId}
        openCardId={glossaryView.openId}
        onOpenFace={(faceId) => {
          setGlossaryView(viewForFace(faceId));
          window.requestAnimationFrame(() => {
            document.getElementById('tree-glossary-panel')?.scrollIntoView({ block: 'start' });
          });
        }}
        onOpenCard={(cardId) => {
          setGlossaryView((current) => viewForCard(glossaryCatalog, cardId, current));
          window.requestAnimationFrame(() => {
            document.getElementById('tree-glossary-panel')?.scrollIntoView({ block: 'start' });
          });
        }}
      />

      <GlossaryBaseCardsPanel
        catalog={glossaryCatalog}
        view={glossaryView}
        onViewChange={setGlossaryView}
        onShowOnDiamond={(_faceId, cardId) => {
          setGlossaryView((current) => viewForCard(glossaryCatalog, cardId, current));
          window.requestAnimationFrame(() => {
            document.getElementById('tree-d8')?.scrollIntoView({ block: 'start' });
          });
        }}
        onCatalogChange={(next) => {
          const saved = saveGlossaryBaseCatalog(next);
          setGlossaryCatalog(saved.catalog);
        }}
        archive={archive}
        edges={allEdges}
        onOpenStep={(treeId, nodeId) => navigate(`/technique-tree?tree=${encodeURIComponent(treeId)}&node=${encodeURIComponent(nodeId)}`)}
      />

      <div className="tree__plan">
        {showLibrary ? (
          <section className="tree__library" aria-label="Trees on this device">
            <ul className="tree__library-list">
              {archive.trees.map((tree) => {
                const base = tree.root?.title.trim() ?? '';
                const on = tree.id === doc.id;
                return (
                  <li key={tree.id}>
                    <button
                      type="button"
                      className={on ? 'tree__library-btn tree__library-btn--on' : 'tree__library-btn'}
                      aria-pressed={on}
                      onClick={() => openTree(tree.id)}
                    >
                      <span>{tree.name}</span>
                      {base && base !== tree.name ? <span className="tree__library-detail">{base}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {confirmDeleteTree ? (
              <div className="tree__confirm" role="group" aria-label={`Delete ${doc.name}`}>
                <p>Delete {doc.name} from this device?</p>
                <div className="tree__library-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirmDeleteTree(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn" onClick={onDeleteTree}>
                    Delete tree
                  </button>
                </div>
              </div>
            ) : (
              <div className="tree__library-actions">
                <button type="button" className="btn" disabled={!doc.root || atCap} onClick={onAddTree}>
                  Add tree
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!doc.root && archive.trees.length < 2}
                  onClick={() => {
                    setConfirmId(null);
                    setConfirmDeleteTree(true);
                  }}
                >
                  Delete tree
                </button>
              </div>
            )}
            {atCap ? <p className="tree__count">{TECHNIQUE_TREE_CAP_NOTE}</p> : null}
            <label className="tree__field" htmlFor="tree-name">
              Tree name
              <input
                id="tree-name"
                value={name}
                maxLength={TREE_NAME_MAX}
                autoComplete="off"
                onFocus={() => {
                  nameFocused.current = true;
                }}
                onChange={(event) => {
                  const next = event.target.value.slice(0, TREE_NAME_MAX);
                  setName(next);
                  if (next.trim()) commit(renameTree(doc, next));
                }}
                onBlur={() => {
                  nameFocused.current = false;
                  const saved = commit(renameTree(doc, name));
                  setName(saved.name);
                }}
              />
            </label>
          </section>
        ) : null}

        {doc.links?.length ? (
          <ul className="tree__links" aria-label="Steps that return to an existing technique">
            {doc.links.map((link) => (
              <li key={link.id}>
                <span>
                  {slotTitle(doc.root, link.fromSlotId)} {link.relation} {slotTitle(doc.root, link.toSlotId)}
                  {link.label ? ` · ${link.label}` : ''}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const links = (doc.links ?? []).filter((item) => item.id !== link.id);
                    const next: TechniqueTreeDoc = { ...doc };
                    if (links.length) next.links = links;
                    else delete next.links;
                    commit(next);
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {doc.root ? (
          <div className="tree__toolbar">
            <p className="tree__count">
              {steps} {steps === 1 ? 'step' : 'steps'} on this device
              {full ? '. This tree is full.' : ''}
            </p>
          </div>
        ) : (
          <section className="tree-node tree-node--root" aria-label="Base position">
            <span className="tree-chip tree-chip--base">Base</span>
            <label className="tree__field" htmlFor="tree-base-title">
              Base position
              <input
                id="tree-base-title"
                value={draftTitle}
                maxLength={TITLE_MAX}
                autoComplete="off"
                autoCapitalize="sentences"
                placeholder="Closed guard"
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </label>
            <label className="tree__field" htmlFor="tree-base-notes">
              Notes
              <textarea
                id="tree-base-notes"
                value={draftNotes}
                rows={3}
                maxLength={NOTES_MAX}
                placeholder="Optional short note"
                onChange={(event) => setDraftNotes(event.target.value)}
              />
            </label>
            <button type="button" className="btn tree__set" disabled={!draftTitle.trim()} onClick={setBase}>
              Set base
            </button>
          </section>
        )}

        {doc.root ? (
          <ul className="tree__list">
            <TreeNodeView
              node={doc.root}
              doc={doc}
              catalog={glossaryCatalog}
              onOpenGlossaryCard={(cardId) => setGlossaryView((current) => viewForCard(glossaryCatalog, cardId, current))}
              confirmId={confirmId}
              focusId={focusId}
              pinnedId={requestedNodeId}
              mentionsFor={(nodeId) => mentionsForNode(mentionIndex, doc.id, nodeId)}
              onToggle={(id) => commit(toggleCollapsed(doc, id))}
              onChange={(id, patch) => commit(updateNode(doc, id, patch))}
              onAdd={onAdd}
              onDelete={onDelete}
              onCancelDelete={() => setConfirmId(null)}
              onConfirmDelete={(id) => {
                commit(removeNode(doc, id));
                setConfirmId(null);
              }}
              onCatalogChange={(next) => {
                const saved = saveGlossaryBaseCatalog(next);
                setGlossaryCatalog(saved.catalog);
              }}
              onLinkGlossary={(id, cardId) => commit(setNodeGlossaryCard(doc, id, cardId))}
              edges={allEdges}
              treeName={treeName}
            />
          </ul>
        ) : null}
      </div>
    </main>
  );
}

function TreeNodeView({
  node,
  doc,
  catalog,
  confirmId,
  focusId,
  pinnedId,
  mentionsFor,
  onToggle,
  onChange,
  onAdd,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  onCatalogChange,
  onOpenGlossaryCard,
  onLinkGlossary,
  edges,
  treeName,
}: {
  node: TechniqueNode;
  doc: TechniqueTreeDoc;
  catalog: GlossaryBaseCatalog;
  confirmId: string | null;
  focusId: string | null;
  pinnedId: string | null;
  mentionsFor: (nodeId: string) => GamePlanMention[];
  onToggle: (id: string) => void;
  onChange: (id: string, patch: { title?: string; notes?: string }) => void;
  onAdd: (parentId: string, kind: TreeChildKind) => void;
  onDelete: (node: TechniqueNode) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
  onCatalogChange: (catalog: GlossaryBaseCatalog) => void;
  onOpenGlossaryCard?: (cardId: string) => void;
  onLinkGlossary: (id: string, cardId: string | null | undefined) => void;
  edges: readonly NamedEdge[];
  treeName: (id: string) => string | null;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusId !== node.id) return;
    titleRef.current?.focus();
  }, [focusId, node.id]);

  const titleId = domId('tree-title', node.id);
  const notesId = domId('tree-notes', node.id);
  const label = node.kind === 'root' ? 'Base position' : node.kind === 'defense' ? 'Defense / counter' : 'Branch';
  const named = node.title.trim() || 'this step';
  const hidden = descendantCount(node);
  const canAdd = canAddChild(doc, node.id);
  const tooDeep = !canAdd && countNodes(doc.root) < MAX_TREE_NODES;
  const confirming = confirmId === node.id;
  const mentions = mentionsFor(node.id);
  const pinned = pinnedId === node.id;
  const identity = stepIdentity(node);
  // Links to this move from other trees, glossary cards, and D8 cards. This tree's own branches are already shown below.
  const elsewhere = node.title.trim()
    ? connectionsForIdentity({ cardId: identity.how === 'unlinked' ? null : identity.cardId, name: stepIdentityName(node) }, edges, {
        skip: (edge) =>
          (edge.source === 'tree' && edge.treeId === doc.id) ||
          (edge.source === 'glossary' && edge.treeId === doc.id && edge.nodeId === node.id),
      })
    : [];

  return (
    <li className="tree__item">
      <article
        className={`tree-node tree-node--${node.kind}${pinned ? ' tree-node--pin' : ''}`}
        aria-label={label}
        data-node-id={node.id}
      >
        <div className="tree-node__head">
          {node.children.length > 0 ? (
            <button
              type="button"
              className="tree-node__toggle"
              aria-expanded={!node.collapsed}
              aria-label={`${node.collapsed ? 'Show' : 'Hide'} steps under ${named}`}
              onClick={() => onToggle(node.id)}
            >
              <span className="tree-node__chevron" aria-hidden="true" />
            </button>
          ) : null}
          <label className="tree__field tree-node__title" htmlFor={titleId}>
            {label}
            <input
              ref={titleRef}
              id={titleId}
              value={node.title}
              maxLength={TITLE_MAX}
              autoComplete="off"
              autoCapitalize="sentences"
                placeholder={
                  node.kind === 'root' ? 'Closed guard' : node.kind === 'defense' ? 'Posture and frame' : 'Triangle'
                }
              onChange={(event) => onChange(node.id, { title: event.target.value })}
            />
          </label>
          {node.kind === 'root' ? <span className="tree-chip tree-chip--base">Base</span> : null}
          {node.kind === 'defense' ? <span className="tree-chip tree-chip--defense">Defense</span> : null}
        </div>

        <label className="tree__field" htmlFor={notesId}>
          Notes
          <textarea
            id={notesId}
            value={node.notes}
            rows={2}
            maxLength={NOTES_MAX}
            placeholder="Optional short note"
            onChange={(event) => onChange(node.id, { notes: event.target.value })}
          />
        </label>

        {mentions.length ? <GamePlanMentions mentions={mentions} /> : null}

        {node.collapsed && hidden > 0 ? (
          <p className="tree-node__folded">
            {hidden} {hidden === 1 ? 'step' : 'steps'} hidden
          </p>
        ) : null}

        {node.title.trim() ? (
          <StepGlossaryLink
            step={node}
            catalog={catalog}
            onLink={(cardId) => onLinkGlossary(node.id, cardId)}
            onOpenCard={onOpenGlossaryCard}
          />
        ) : null}
        {elsewhere.length ? (
          <IdentityConnections
            rows={elsewhere}
            treeName={treeName}
            onOpenCard={onOpenGlossaryCard}
            testId="tree-step-elsewhere"
            label="Also connected"
          />
        ) : null}
        <TreeConnectField
          catalog={catalog}
          from={{ type: 'tree', treeId: doc.id, nodeId: node.id, slotId: node.slotId, title: node.title }}
          blockedIds={identity.cardId ? [`gl.${identity.cardId.slice('gbase.'.length)}`] : []}
          onCatalogChange={onCatalogChange}
        />
        <GlossaryLinkList
          catalog={catalog}
          links={linksFrom(catalog, { type: 'tree', treeId: doc.id, nodeId: node.id, slotId: node.slotId, title: node.title })}
          onCatalogChange={onCatalogChange}
          onOpenCard={onOpenGlossaryCard}
        />

        <div className="tree-node__actions">
          <button type="button" className="btn" disabled={!canAdd} onClick={() => onAdd(node.id, 'branch')}>
            + Branch
          </button>
          <button type="button" className="btn" disabled={!canAdd} onClick={() => onAdd(node.id, 'defense')}>
            + Defense / counter
          </button>
          <button type="button" className="btn btn--ghost tree-node__delete" onClick={() => onDelete(node)}>
            Delete
          </button>
        </div>
        {tooDeep ? <p className="tree-node__limit">This step is as deep as the tree goes.</p> : null}

        {confirming ? (
          <div className="tree__confirm" role="group" aria-label={`Delete ${named}`}>
            <p>
              Delete {named} and {hidden} {hidden === 1 ? 'step' : 'steps'} under it?
            </p>
            <div className="tree__confirm-actions">
              <button type="button" className="btn btn--ghost" onClick={onCancelDelete}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => onConfirmDelete(node.id)}>
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </article>

      {node.children.length > 0 && !node.collapsed ? (
        <ul className="tree__list">
          {node.children.map((child) => (
            <TreeNodeView
              key={child.id}
              node={child}
              doc={doc}
              catalog={catalog}
              onOpenGlossaryCard={onOpenGlossaryCard}
              confirmId={confirmId}
              focusId={focusId}
              pinnedId={pinnedId}
              mentionsFor={mentionsFor}
              onToggle={onToggle}
              onChange={onChange}
              onAdd={onAdd}
              onDelete={onDelete}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={onConfirmDelete}
              onCatalogChange={onCatalogChange}
              onLinkGlossary={onLinkGlossary}
              edges={edges}
              treeName={treeName}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function GamePlanMentions({ mentions }: { mentions: GamePlanMention[] }) {
  return (
    <div className="tree-node__plans">
      <p>Game plans</p>
      <ul>
        {mentions.map((mention) => (
          <li key={`${mention.competitorId}-${mention.section}`}>
            <Link
              className={`tree-plan-chip tree-plan-chip--${mention.flag || 'open'}`}
              to={`/game-plan?id=${encodeURIComponent(mention.competitorId)}`}
            >
              {mention.name}
              <span>{mentionText(mention)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function slotTitle(node: TechniqueNode | null, slotId: string): string {
  if (!node) return 'a removed step';
  if (node.slotId === slotId) return node.title.trim() || 'Untitled';
  for (const child of node.children) {
    if (child.slotId === slotId || containsSlot(child, slotId)) return slotTitle(child, slotId);
  }
  return 'a removed step';
}

function containsSlot(node: TechniqueNode, slotId: string): boolean {
  if (node.slotId === slotId) return true;
  return node.children.some((child) => containsSlot(child, slotId));
}

function domId(prefix: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  return `${prefix}-${safe || 'node'}`;
}
