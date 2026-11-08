import { useMemo, useState } from 'react';
import type { StudentProgressReport } from '../../lib/progress/types';
import { techniquePicker } from '../../lib/techniqueIndex';
import type { LinkIntent, TechniqueAnchor } from '../../lib/videoAssociation';
import { sameTitleOnWorkingList } from '../../lib/videoAssociation';
import { findWorkingByTitle, readWorkingGraph, workingTitleKey } from '../../lib/workingTechniques';

const linkId = (item: { catalogItemId: string; entryId: string }) => item.catalogItemId || item.entryId;

/**
 * Choose where a video title belongs. Nothing is written until the parent saves.
 * Picking a name that already exists reuses that id.
 */
export function TechniqueLinkPicker({
  report,
  title,
  intent,
  onChange,
}: {
  report: StudentProgressReport;
  title: string;
  intent: LinkIntent;
  onChange: (intent: LinkIntent) => void;
}) {
  const [which, setWhich] = useState<'fundamental' | 'working' | null>(null);
  const [search, setSearch] = useState('');
  const view = useMemo(() => (which === 'fundamental' ? techniquePicker(report, search) : null), [which, report, search]);
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  const named = workingTitleKey(title);
  const workingMatch = named ? findWorkingByTitle(graph, title) : null;
  const selected =
    intent.kind === 'fundamental' || intent.kind === 'working'
      ? intent.name
      : intent.kind === 'create-fundamental'
        ? 'New fundamental from this title'
        : intent.kind === 'create-working'
          ? "New technique on Techniques I'm working on"
          : 'Not linked';

  return (
    <div className="video-link">
      <p className="student-quiet">Put that in play. This does not mark it learned or change a level you already saved.</p>
      <p className="video-link__choice">{selected}</p>
      <div className="journal-videos__actions">
        <button type="button" className="ink-btn" onClick={() => onChange({ kind: 'none' })}>
          Do not link
        </button>
        <button type="button" className="ink-btn" onClick={() => { setSearch(''); setWhich('fundamental'); }}>
          Choose a fundamental
        </button>
        <button type="button" className="ink-btn" onClick={() => setWhich('working')}>
          Choose a working technique
        </button>
        {named ? (
          <button type="button" className="ink-btn" onClick={() => onChange({ kind: 'create-fundamental' })}>
            {`Add “${title.trim()}” to fundamentals`}
          </button>
        ) : null}
        {named ? (
          <button type="button" className="ink-btn" onClick={() => onChange({ kind: 'create-working' })}>
            {sameTitleOnWorkingList(report, title) || workingMatch
              ? `Link “${title.trim()}” to the technique already on your list`
              : `Add “${title.trim()}” to Techniques I'm working on`}
          </button>
        ) : null}
      </div>
      {which === 'working' ? (
        <div className="video-link__list" role="group" aria-label="Techniques I'm working on">
          <button type="button" className="ink-btn" onClick={() => setWhich(null)}>
            Close
          </button>
          {graph.nodes.length === 0 ? <p className="student-quiet">No techniques on that list yet.</p> : null}
          {graph.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="ink-btn"
              onClick={() => {
                onChange({ kind: 'working', id: node.id, name: node.title });
                setWhich(null);
              }}
            >
              {node.title}
            </button>
          ))}
        </div>
      ) : null}
      {which === 'fundamental' && view ? (
        <div className="video-link__list" role="group" aria-label="Fundamentals">
          <button type="button" className="ink-btn" onClick={() => setWhich(null)}>
            Close
          </button>
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input aria-label="Search fundamentals to link" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {view.categories.map((category) => (
            <section key={category.id}>
              <h3 className="student-picker__category">{category.name}</h3>
              {category.items.map((item) => {
                const id = linkId(item);
                if (!id) return null;
                return (
                  <button
                    key={`${id}-${item.name}`}
                    type="button"
                    className="ink-btn"
                    onClick={() => {
                      onChange({ kind: 'fundamental', id, name: item.label });
                      setWhich(null);
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </section>
          ))}
          {!view.categories.length ? <p className="student-quiet">No fundamentals match.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function SavedTechniqueLink({
  report,
  title,
  anchor,
  onSave,
  onUnlink,
}: {
  report: StudentProgressReport;
  title: string;
  anchor?: TechniqueAnchor;
  onSave: (intent: LinkIntent) => string;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<LinkIntent>({ kind: 'none' });
  const [error, setError] = useState('');
  return (
    <div className="video-link">
      <p className="student-quiet">{anchorSentence(anchor)}</p>
      <div className="journal-videos__actions">
        <button type="button" className="ink-btn" onClick={() => { setOpen((value) => !value); setError(''); }}>
          {open ? 'Cancel link' : 'Put that in play'}
        </button>
        {anchor ? (
          <button type="button" className="ink-btn" onClick={onUnlink}>
            Unlink
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <TechniqueLinkPicker report={report} title={title} intent={intent} onChange={setIntent} />
          <button
            type="button"
            className="ink-btn ink-btn--save"
            onClick={() => {
              const message = onSave(intent);
              if (message) {
                setError(message);
                return;
              }
              setOpen(false);
              setIntent({ kind: 'none' });
            }}
          >
            Link video
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

export function anchorSentence(anchor: TechniqueAnchor | undefined): string {
  if (!anchor) return 'Not linked to a fundamental or a working technique.';
  return anchor.kind === 'working'
    ? `Linked to ${anchor.name} on Techniques I'm working on.`
    : `Linked to ${anchor.name} on fundamentals.`;
}
