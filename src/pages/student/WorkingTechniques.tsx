import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ShareChoice, SharePreview } from '../../lib/techniqueShare';
import {
  applyWorkingImport,
  previewWorkingImport,
  downloadTechniqueShare,
  readTechniqueShare,
  shareFromWorking,
  workingImportBlocked,
} from '../../lib/techniqueShare';
import { placeOnFundamentals } from '../../lib/studentEdition';
import type { WorkingNode, WorkingRelation } from '../../lib/progress/types';
import {
  WORKING_RELATIONS,
  adoptWorkingNode,
  connectWorkingNodes,
  emptyWorkingGraph,
  findWorkingNode,
  readWorkingGraph,
  relationLabel,
  removeWorkingNode,
  renameWorkingNode,
  setWorkingFundamental,
  setWorkingNotes,
  treeFrom,
  unlinkWorkingEdge,
  workingRoots,
  type TreeFrame,
} from '../../lib/workingTechniques';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';
import './workingTechniques.css';

export function WorkingTechniquesPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'tree' ? 'tree' : 'list';
  const focus = params.get('node') ?? '';
  const graph = readWorkingGraph(report.working) ?? emptyWorkingGraph();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'technique' | 'position'>('technique');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [incoming, setIncoming] = useState<SharePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, ShareChoice>>({});

  const open = (node: string, nextView = view) => {
    const query = new URLSearchParams(params);
    query.set('view', nextView);
    if (node) query.set('node', node);
    else query.delete('node');
    setParams(query, { replace: true });
  };

  const saveNode = () => {
    try {
      const adopted = adoptWorkingNode(graph, { title, kind });
      commit({ ...report, working: adopted.graph });
      setTitle('');
      setError('');
      setStatus(adopted.created ? `${adopted.node.title} is on your list.` : `${adopted.node.title} was already on your list.`);
      open(adopted.node.id, 'list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that technique.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Techniques I'm working on" />
      <div className="student-paper">
        <div className="work">
          <p className="work__lead">
            The list and the tree are the same techniques. A step points at one that already exists. Fundamentals stay a smaller list.
          </p>
          <div className="work__actions">
            <Link className="work__btn" to={to('/student/journal')}>
              Journal
            </Link>
            <Link className="work__btn" to={to('/student/fundamentals')}>
              Fundamentals
            </Link>
            <button
              type="button"
              className="work__btn"
              onClick={() => downloadTechniqueShare(shareFromWorking(graph, 'Techniques I am working on'))}
            >
              Export tree
            </button>
            <label className="work__btn">
              Import tree
              <input
                className="work__file"
                type="file"
                accept="application/json,.json"
                aria-label="Import technique share file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const blocked = workingImportBlocked(localStorage);
                  if (blocked) {
                    setError(blocked);
                    setIncoming(null);
                    return;
                  }
                  void file.text().then((text) => {
                    const read = readTechniqueShare(text);
                    if (!read.ok) {
                      setError(read.error);
                      setIncoming(null);
                      return;
                    }
                    setError('');
                    setChoices({});
                    setIncoming(previewWorkingImport(graph, read.file));
                  });
                }}
              />
            </label>
          </div>
          {incoming ? (
            <ShareReview
              preview={incoming}
              choices={choices}
              onChoice={(shareId, choice) => setChoices((current) => ({ ...current, [shareId]: choice }))}
              onCancel={() => setIncoming(null)}
              onAccept={() => {
                const next = applyWorkingImport(graph, incoming.file, new Map(Object.entries(choices)));
                commit({ ...report, working: next });
                setIncoming(null);
                setStatus(`Imported ${incoming.file.name}. Nothing was marked learned.`);
              }}
            />
          ) : null}
          <div className="work__tabs" role="tablist" aria-label="Working techniques">
            <button type="button" role="tab" className={view === 'list' ? 'work__tab is-on' : 'work__tab'} aria-selected={view === 'list'} onClick={() => open(focus, 'list')}>
              List
            </button>
            <button type="button" role="tab" className={view === 'tree' ? 'work__tab is-on' : 'work__tab'} aria-selected={view === 'tree'} onClick={() => open(focus, 'tree')}>
              Tree
            </button>
          </div>
          <form
            className="work__form"
            onSubmit={(event) => {
              event.preventDefault();
              saveNode();
            }}
          >
            <label>
              <span className="ink__label">Name</span>
              <input aria-label="Technique or position name" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <div className="work__actions" role="group" aria-label="Kind">
              <button type="button" className={kind === 'technique' ? 'work__tab is-on' : 'work__tab'} aria-pressed={kind === 'technique'} onClick={() => setKind('technique')}>
                Technique
              </button>
              <button type="button" className={kind === 'position' ? 'work__tab is-on' : 'work__tab'} aria-pressed={kind === 'position'} onClick={() => setKind('position')}>
                Position
              </button>
            </div>
            <button type="button" className="work__btn work__btn--primary" onClick={saveNode}>
              Add to my list
            </button>
          </form>
          {error ? <p role="alert">{error}</p> : null}
          {status ? <p role="status">{status}</p> : null}
          {view === 'list' ? (
            <ul className="work__list" aria-label="Techniques I'm working on">
              {graph.nodes.length === 0 ? <li className="work__quiet">Nothing yet. Add a technique, or link one from the journal.</li> : null}
              {graph.nodes.map((node) => (
                <li key={node.id}>
                  <article className={node.id === focus ? 'work__card is-on' : 'work__card'} id={`work-${node.id}`}>
                    <strong>{node.title}</strong>
                    <span className="work__meta">
                      {node.kind === 'position' ? 'Position' : 'Technique'}
                      {node.fundamentalId ? ' · On fundamentals' : ' · Not on fundamentals'}
                    </span>
                    <button type="button" className="work__btn" onClick={() => open(node.id, 'tree')}>
                      Show in tree
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <TreeView
              graphNodes={graph.nodes}
              roots={workingRoots(graph)}
              focus={focus}
              onFocus={(id) => open(id, 'tree')}
              renderFrame={(id) => treeFrom(graph, id)}
            />
          )}
          {focus && findWorkingNode(graph, focus) ? (
            <NodeEditor
              key={focus}
              node={findWorkingNode(graph, focus)!}
              nodes={graph.nodes}
              edges={graph.edges.filter((edge) => edge.fromId === focus || edge.toId === focus)}
              onRename={(next) => {
                try {
                  commit({ ...report, working: renameWorkingNode(graph, focus, next) });
                  setError('');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not rename that technique.');
                }
              }}
              onNotes={(notes) => commit({ ...report, working: setWorkingNotes(graph, focus, notes) })}
              onConnect={(toId, relation, label) => {
                const linked = connectWorkingNodes(graph, { fromId: focus, toId, relation, label });
                if (!linked.ok) {
                  setError(linked.reason === 'self' ? 'A technique cannot connect to itself.' : 'Pick a technique that is already on your list.');
                  return;
                }
                commit({ ...report, working: linked.graph });
                setError('');
                setStatus(linked.created ? 'Connected to the technique you already have.' : 'That step was already there.');
              }}
              onUnlink={(edgeId) => commit({ ...report, working: unlinkWorkingEdge(graph, edgeId) })}
              fundamentalsTo={to('/student/fundamentals')}
              onFundamental={() => {
                const current = findWorkingNode(graph, focus);
                if (!current) return;
                if (current.fundamentalId) {
                  commit({ ...report, working: setWorkingFundamental(graph, focus, '') });
                  setStatus(`${current.title} stays on your working list and is off the fundamentals list.`);
                  return;
                }
                const placed = placeOnFundamentals(report, current.title);
                const withLevel = placed.report;
                commit({
                  ...withLevel,
                  working: setWorkingFundamental(readWorkingGraph(withLevel.working) ?? graph, focus, placed.id),
                });
                setStatus(
                  placed.id
                    ? `${current.title} is on your fundamentals list at Not started. It is not marked learned.`
                    : 'That name could not be added to fundamentals.',
                );
              }}
              onRemove={() => {
                commit({ ...report, working: removeWorkingNode(graph, focus) });
                open('', view);
                setStatus('Removed from your list. Journal notes that used the name stay.');
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function TreeView({
  graphNodes,
  roots,
  focus,
  onFocus,
  renderFrame,
}: {
  graphNodes: WorkingNode[];
  roots: WorkingNode[];
  focus: string;
  onFocus: (id: string) => void;
  renderFrame: (id: string) => TreeFrame | null;
}) {
  if (!graphNodes.length) return <p className="work__quiet">The tree is empty until a technique is on your list.</p>;
  return (
    <ul className="work__tree" aria-label="Technique tree">
      {roots.map((root) => {
        const frame = renderFrame(root.id);
        return frame ? (
          <li key={root.id}>
            <TreeBranch frame={frame} focus={focus} onFocus={onFocus} />
          </li>
        ) : null;
      })}
    </ul>
  );
}

function TreeBranch({ frame, focus, onFocus }: { frame: TreeFrame; focus: string; onFocus: (id: string) => void }) {
  return (
    <>
      <article className={frame.node.id === focus ? 'work__node is-on' : 'work__node'}>
        <button type="button" className="work__btn" onClick={() => onFocus(frame.node.id)}>
          {frame.node.title}
        </button>
        <span className="work__meta">
          {frame.node.kind === 'position' ? 'Position' : 'Technique'}
          {frame.cycle ? ' · Returns here' : ''}
          {frame.truncated ? ' · More steps are on the list' : ''}
        </span>
      </article>
      {frame.cycle || frame.steps.length === 0 ? null : (
        <ul>
          {frame.steps.map((step) => (
            <li key={step.edge.id}>
              <span className="work__meta">
                {relationLabel(step.edge.relation)}
                {step.edge.label ? ` · ${step.edge.label}` : ''}
                {step.next.cycle ? ` · returns to ${step.next.node.title}` : ''}
              </span>
              {step.next.cycle ? (
                <button type="button" className="work__btn" onClick={() => onFocus(step.next.node.id)}>
                  {`Open ${step.next.node.title}`}
                </button>
              ) : (
                <TreeBranch frame={step.next} focus={focus} onFocus={onFocus} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NodeEditor({
  node,
  nodes,
  edges,
  onRename,
  onNotes,
  onConnect,
  onUnlink,
  onRemove,
  onFundamental,
  fundamentalsTo,
}: {
  node: WorkingNode;
  nodes: WorkingNode[];
  edges: { id: string; fromId: string; toId: string; relation: WorkingRelation; label: string }[];
  onRename: (title: string) => void;
  onNotes: (notes: string) => void;
  onConnect: (toId: string, relation: WorkingRelation, label: string) => void;
  onUnlink: (edgeId: string) => void;
  onRemove: () => void;
  onFundamental: () => void;
  fundamentalsTo: string;
}) {
  const [title, setTitle] = useState(node.title);
  const [notes, setNotes] = useState(node.notes);
  const [target, setTarget] = useState('');
  const [relation, setRelation] = useState<WorkingRelation>('defense');
  const [label, setLabel] = useState('');
  const [confirm, setConfirm] = useState(false);
  const others = nodes.filter((item) => item.id !== node.id);
  return (
    <section className="work__form" aria-label={`Edit ${node.title}`}>
      <h2 className="ink__label">{node.title}</h2>
      <div className="work__actions">
        {node.fundamentalId ? (
          <Link className="work__btn" to={fundamentalsTo}>
            On fundamentals · Not started unless you set a level there
          </Link>
        ) : (
          <span className="work__quiet">Not on the fundamentals list.</span>
        )}
        <button type="button" className="work__btn" onClick={onFundamental}>
          {node.fundamentalId ? 'Take off fundamentals' : 'Put on fundamentals list'}
        </button>
      </div>
      <label>
        <span className="ink__label">Title</span>
        <input aria-label="Technique title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button type="button" className="work__btn" onClick={() => onRename(title)}>
        Save title
      </button>
      <label>
        <span className="ink__label">Notes</span>
        <textarea aria-label="Technique notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <button type="button" className="work__btn" onClick={() => onNotes(notes)}>
        Save notes
      </button>
      <h3 className="ink__label">Connect to an existing technique</h3>
      <label>
        <span className="ink__label">Step</span>
        <select aria-label="Kind of step" value={relation} onChange={(event) => setRelation(event.target.value as WorkingRelation)}>
          {WORKING_RELATIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="work__actions" role="group" aria-label="Existing technique">
        {others.length === 0 ? <span className="work__quiet">Add the other technique first.</span> : null}
        {others.map((item) => (
          <button
            key={item.id}
            type="button"
            className={target === item.id ? 'work__tab is-on' : 'work__tab'}
            aria-pressed={target === item.id}
            onClick={() => setTarget(item.id)}
          >
            {item.kind === 'position' ? `${item.title} (position)` : item.title}
          </button>
        ))}
      </div>
      <label>
        <span className="ink__label">Short label</span>
        <input aria-label="Step label" value={label} placeholder="defended" onChange={(event) => setLabel(event.target.value)} />
      </label>
      <button
        type="button"
        className="work__btn work__btn--primary"
        onClick={() => {
          if (!target) return;
          onConnect(target, relation, label);
          setLabel('');
        }}
      >
        Connect
      </button>
      <ul className="work__list" aria-label="Steps touching this technique">
        {edges.map((edge) => {
          const otherId = edge.fromId === node.id ? edge.toId : edge.fromId;
          const other = nodes.find((item) => item.id === otherId);
          const direction = edge.fromId === node.id ? 'to' : 'from';
          return (
            <li key={edge.id} className="work__edge">
              <span>{`${relationLabel(edge.relation)} ${direction} ${other?.title ?? 'a removed technique'}${edge.label ? ` · ${edge.label}` : ''}`}</span>
              <button type="button" className="work__btn" onClick={() => onUnlink(edge.id)}>
                Unlink
              </button>
            </li>
          );
        })}
      </ul>
      {confirm ? (
        <div className="work__actions" role="group" aria-label="Remove this technique">
          <span>Remove this technique and its steps? Other techniques stay.</span>
          <button type="button" className="work__btn work__btn--primary" onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="work__btn" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button type="button" className="work__btn" onClick={() => setConfirm(true)}>
          Remove from my list
        </button>
      )}
    </section>
  );
}

function ShareReview({
  preview,
  choices,
  onChoice,
  onCancel,
  onAccept,
}: {
  preview: SharePreview;
  choices: Record<string, ShareChoice>;
  onChoice: (shareId: string, choice: ShareChoice) => void;
  onCancel: () => void;
  onAccept: () => void;
}) {
  return (
    <section className="work__form" aria-label="Review technique share">
      <h2 className="ink__label">Review {preview.file.name}</h2>
      <p className="work__quiet">
        Nothing is added until you accept. Imported techniques join your working list and are not marked learned.
      </p>
      <p className="work__quiet">
        {preview.add.length} new, {preview.unchanged.length} already here, {preview.conflicts.length} need a choice.
      </p>
      <ul className="work__list">
        {preview.add.map((node) => (
          <li key={node.shareId}>Add {node.title}</li>
        ))}
        {preview.conflicts.map((conflict) => {
          const chosen = choices[conflict.shareId] ?? (conflict.kind === 'title' ? 'keep' : 'skip');
          return (
            <li key={conflict.shareId} className="work__edge">
              <span>
                {conflict.kind === 'title'
                  ? `You call this ${conflict.localTitle}. The file calls it ${conflict.title}.`
                  : `${conflict.title} matches a technique already on your list, with a different id.`}
              </span>
              {conflict.kind === 'title' ? (
                <>
                  <button type="button" className="work__btn" aria-pressed={chosen === 'keep'} onClick={() => onChoice(conflict.shareId, 'keep')}>
                    Keep my title
                  </button>
                  <button type="button" className="work__btn" aria-pressed={chosen === 'take'} onClick={() => onChoice(conflict.shareId, 'take')}>
                    Use the file title
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="work__btn" aria-pressed={chosen === 'skip'} onClick={() => onChoice(conflict.shareId, 'skip')}>
                    Leave them separate
                  </button>
                  <button
                    type="button"
                    className="work__btn"
                    aria-pressed={chosen === 'use-local'}
                    onClick={() => onChoice(conflict.shareId, 'use-local')}
                  >
                    Use the one already on my list
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="work__actions">
        <button type="button" className="work__btn work__btn--primary" onClick={onAccept}>
          Accept import
        </button>
        <button type="button" className="work__btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
