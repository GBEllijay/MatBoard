import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { TECHNIQUE_TREE_CAP_NOTE, TECHNIQUE_TREE_LABEL, TECHNIQUE_TREE_LEAD } from '../lib/coachCopy';
import { DEVICE_STORAGE_FULL_NOTE } from '../lib/storageQuota';
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
  loadTechniqueArchive,
  removeNode,
  renameTree,
  saveTechniqueArchive,
  selectTree,
  setRoot,
  toggleCollapsed,
  updateActive,
  updateNode,
  type TechniqueNode,
  type TechniqueTreeArchive,
  type TechniqueTreeDoc,
  type TreeChildKind,
} from '../lib/techniqueTreeStore';

export function TechniqueTreePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const parent = useToolboxParent();
  useCoachPageSwipe();
  const requestedTreeId = searchParams.get('tree');
  const [archive, setArchive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());
  const doc = activeTree(archive);
  const [note, setNote] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmDeleteTree, setConfirmDeleteTree] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [name, setName] = useState(doc.name);
  const nameFocused = useRef(false);

  useEffect(() => {
    if (!nameFocused.current) setName(doc.name);
  }, [doc.name]);

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

  const commitArchive = (next: TechniqueTreeArchive) => {
    const saved = saveTechniqueArchive(next);
    setArchive(saved.archive);
    setNote(saved.saved ? '' : saved.quota ? DEVICE_STORAGE_FULL_NOTE : 'Could not save these trees on this phone.');
    return saved.archive;
  };

  const commit = (next: TechniqueTreeDoc) => activeTree(commitArchive(updateActive(archive, next)));

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
        to={parent.path}
        onExit={() => {
          navigate(parent.path);
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
      {note ? (
        <p className="tree__status" role="status">
          {note}
        </p>
      ) : null}

      <div className="tree__plan">
        {showLibrary ? (
          <section className="tree__library" aria-label="Trees on this phone">
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
                <p>Delete {doc.name} from this phone?</p>
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

        {doc.root ? (
          <div className="tree__toolbar">
            <p className="tree__count">
              {steps} {steps === 1 ? 'step' : 'steps'} on this phone
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
              confirmId={confirmId}
              focusId={focusId}
              onToggle={(id) => commit(toggleCollapsed(doc, id))}
              onChange={(id, patch) => commit(updateNode(doc, id, patch))}
              onAdd={onAdd}
              onDelete={onDelete}
              onCancelDelete={() => setConfirmId(null)}
              onConfirmDelete={(id) => {
                commit(removeNode(doc, id));
                setConfirmId(null);
              }}
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
  confirmId,
  focusId,
  onToggle,
  onChange,
  onAdd,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  node: TechniqueNode;
  doc: TechniqueTreeDoc;
  confirmId: string | null;
  focusId: string | null;
  onToggle: (id: string) => void;
  onChange: (id: string, patch: { title?: string; notes?: string }) => void;
  onAdd: (parentId: string, kind: TreeChildKind) => void;
  onDelete: (node: TechniqueNode) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
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

  return (
    <li className="tree__item">
      <article className={`tree-node tree-node--${node.kind}`} aria-label={label}>
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

        {node.collapsed && hidden > 0 ? (
          <p className="tree-node__folded">
            {hidden} {hidden === 1 ? 'step' : 'steps'} hidden
          </p>
        ) : null}

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
              confirmId={confirmId}
              focusId={focusId}
              onToggle={onToggle}
              onChange={onChange}
              onAdd={onAdd}
              onDelete={onDelete}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={onConfirmDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function domId(prefix: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  return `${prefix}-${safe || 'node'}`;
}
