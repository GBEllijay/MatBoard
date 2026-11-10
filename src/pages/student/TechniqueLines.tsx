/**
 * "Technique drilled" as lines, like the coach's daily video section: each line
 * is a technique name (free text, suggestions from fundamentals + My techniques),
 * a "What I learned" note, and an optional "On my fundamentals list?" link.
 * Pick opens the fundamentals list with a search box and a My techniques section.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import { ageIllegalTechniques } from '../../lib/studentBenchmarks';
import {
  JOURNAL_TECHNIQUE_MAX,
  isFundamentalLink,
  placeOnFundamentals,
  techniqueDrilledLabel,
  techniqueNoteLabel,
  type FundamentalRow,
  type JournalTechniqueLine,
} from '../../lib/studentEdition';
import { armOverlayExit } from '../../lib/overlayExit';
import { techniquePicker, techniqueSuggestions } from '../../lib/techniqueIndex';
import { GlossaryField } from '../../glossary/GlossaryField';
import { hiddenGlossaryTerms } from '../../lib/glossarySource';
import { useStudentPath } from './chrome';
import {
  adoptWorkingNode,
  findWorkingByTitle,
  findWorkingNode,
  readWorkingGraph,
  setWorkingFundamental,
  workingTitleKey,
} from '../../lib/workingTechniques';

export type TechniqueLineRow = { id: string; name: string; note: string; workingId?: string };

export function blankTechniqueLines(count: number): TechniqueLineRow[] {
  return Array.from({ length: count }, () => ({ id: '', name: '', note: '' }));
}

export function techniqueLinesFrom(rows: readonly JournalTechniqueLine[], min: number): TechniqueLineRow[] {
  const out = rows.map((row) => ({ id: row.id, name: row.name, note: row.note ?? '', ...(row.workingId ? { workingId: row.workingId } : {}) }));
  while (out.length < min) out.push({ id: '', name: '', note: '' });
  return out;
}

const linkId = (item: FundamentalRow) => item.catalogItemId || item.entryId;

export function TechniqueLines({
  idPrefix,
  report,
  rows,
  onChange,
  onReport,
}: {
  idPrefix: string;
  report: StudentProgressReport;
  rows: TechniqueLineRow[];
  onChange: (next: TechniqueLineRow[]) => void;
  /** Saves the shared technique list. The journal card still saves on its own button. */
  onReport?: (next: StudentProgressReport) => void;
}) {
  const to = useStudentPath();
  const hiddenTerms = hiddenGlossaryTerms(report);
  const listId = `technique-suggestions-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [picker, setPicker] = useState<number | null>(null);
  const [workingFor, setWorkingFor] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const suggestions = useMemo(() => techniqueSuggestions(report), [report]);
  const set = (index: number, patch: Partial<TechniqueLineRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const open = (index: number, query = '') => {
    setSearch(query);
    setPicker(index);
  };
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  const saveGraph = (nextReport: StudentProgressReport) => onReport?.(nextReport);
  const linkByName = (index: number) => {
    const name = rows[index]?.name ?? '';
    const placed = placeOnFundamentals(report, name);
    if (!placed.id) {
      open(index, name);
      return;
    }
    let next = placed.report;
    const workingId = rows[index]?.workingId ?? '';
    if (workingId && findWorkingNode(graph, workingId)) {
      next = { ...next, working: setWorkingFundamental(readWorkingGraph(next.working) ?? graph, workingId, placed.id) };
    }
    if (next !== report) saveGraph(next);
    set(index, { id: placed.id });
    setNotice(placed.report === report ? '' : `${name.trim()} is on your fundamentals list. It is not marked as learned.`);
  };
  const linkWorking = (index: number, title: string) => {
    const row = rows[index];
    if (!row || !workingTitleKey(title)) return;
    const adopted = adoptWorkingNode(graph, { title, fundamentalId: isFundamentalLink(row.id) ? row.id : '' });
    saveGraph({ ...report, working: adopted.graph });
    set(index, { workingId: adopted.node.id });
    setWorkingFor(null);
    setNotice(adopted.created ? `${adopted.node.title} is on Techniques I'm working on.` : `Linked to ${adopted.node.title}. Same technique, not a second copy.`);
  };
  const view = picker === null ? null : techniquePicker(report, search);
  useEffect(() => {
    if (picker === null) return;
    return armOverlayExit('student-technique-picker', () => setPicker(null), { lockScroll: true });
  }, [picker]);
  useEffect(() => {
    if (workingFor === null) return;
    return armOverlayExit('student-working-picker', () => setWorkingFor(null), { lockScroll: true });
  }, [workingFor]);
  return (
    <>
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {rows.map((row, index) => {
        const label = techniqueDrilledLabel(index);
        const linked = isFundamentalLink(row.id);
        return (
          <div key={index} className="technique-line" role="group" aria-label={`${idPrefix}${label} line`} data-testid="technique-line">
            <label className={index % 2 === 0 ? 'ink ink--tech' : 'ink ink--wobble ink--tech'}>
              <span className="ink__label">{label}</span>
              <input
                aria-label={`${idPrefix}${label}`}
                spellCheck
                autoCorrect="on"
                list={listId}
                autoComplete="off"
                value={row.name}
                onChange={(event) => {
                  const name = event.target.value;
                  const same = row.name === name;
                  set(index, { name, id: same ? row.id : '', workingId: same ? row.workingId : '' });
                }}
              />
              <button type="button" className="student-pick" aria-label={`Pick ${idPrefix}${label} from fundamentals`} onClick={() => open(index)}>
                Pick
              </button>
            </label>
            <GlossaryField
              className="ink ink--wobble journal-note technique-line__note"
              label="What I learned"
              ariaLabel={`${idPrefix}${techniqueNoteLabel(index)}`}
              rows={2}
              maxLength={400}
              value={row.note}
              onChange={(note) => set(index, { note })}
              blockedIds={hiddenTerms.ids}
              blockedNames={hiddenTerms.names}
              testId={index === 0 ? 'technique-note' : undefined}
            />
            <label className="technique-line__link">
              <input
                type="checkbox"
                aria-label={`${idPrefix}On my fundamentals list? #${index + 1}`}
                checked={linked}
                onChange={(event) => (event.target.checked ? linkByName(index) : set(index, { id: '' }))}
              />
              <span>On my fundamentals list?</span>
            </label>
            {(() => {
              const linked = row.workingId ? findWorkingNode(graph, row.workingId) : null;
              return (
                <div className="technique-line__work">
                  <button type="button" className="student-pick" aria-label={`${idPrefix}Add technique #${index + 1} to techniques I'm working on`} onClick={() => setWorkingFor(index)}>
                    Techniques I'm working on
                  </button>
                  {linked ? (
                    <>
                      <Link className="technique-line__open" to={to(`/student/working?node=${encodeURIComponent(linked.id)}`)}>
                        {`On your working list · ${linked.title}`}
                      </Link>
                      <button type="button" className="student-pick" aria-label={`${idPrefix}Remove working link #${index + 1}`} onClick={() => set(index, { workingId: '' })}>
                        Remove link
                      </button>
                    </>
                  ) : row.workingId ? (
                    <span className="student-quiet">That technique is no longer on your list.</span>
                  ) : null}
                </div>
              );
            })()}
          </div>
        );
      })}
      {rows.length < JOURNAL_TECHNIQUE_MAX ? (
        <button type="button" className="ink-btn ink-btn--small" onClick={() => onChange([...rows, { id: '', name: '', note: '' }])}>
          Add another technique
        </button>
      ) : null}
      {notice ? <p className="student-quiet" role="status">{notice}</p> : null}
      {workingFor === null ? null : (
        <div className="student-picker" role="dialog" aria-label={`Techniques I'm working on for ${idPrefix}${techniqueDrilledLabel(workingFor)}`}>
          <button type="button" className="ink-btn" onClick={() => setWorkingFor(null)}>
            Close
          </button>
          <p className="student-quiet">This adds or selects one technique. It does not mark it learned.</p>
          {workingTitleKey(rows[workingFor]?.name ?? '') ? (
            <button type="button" className="student-picker__item" onClick={() => linkWorking(workingFor, rows[workingFor]?.name ?? '')}>
              {findWorkingByTitle(graph, rows[workingFor]?.name ?? '')
                ? `Link “${rows[workingFor]?.name.trim()}” to the technique already on your list`
                : `Add “${rows[workingFor]?.name.trim()}” to Techniques I'm working on`}
            </button>
          ) : (
            <p className="student-quiet">Type the technique name first.</p>
          )}
          {graph.nodes.length ? <h2 className="student-picker__category">Already on your list</h2> : null}
          {graph.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="student-picker__item"
              onClick={() => {
                set(workingFor, { workingId: node.id, name: rows[workingFor]?.name.trim() ? rows[workingFor].name : node.title });
                setWorkingFor(null);
                setNotice(`Linked to ${node.title}.`);
              }}
            >
              {`${node.title}${node.kind === 'position' ? ' · Position' : ''}`}
            </button>
          ))}
        </div>
      )}
      {picker === null || !view ? null : (
        <div className="student-picker" role="dialog" aria-label={`Pick ${idPrefix}${techniqueDrilledLabel(picker)}`}>
          <button type="button" className="ink-btn" onClick={() => setPicker(null)}>
            Close
          </button>
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input aria-label="Search techniques" type="search" value={search} placeholder="Fundamentals and my techniques" onChange={(event) => setSearch(event.target.value)} />
          </label>
          {ageIllegalTechniques(report).length ? (
            <p className="student-quiet">Some techniques are hidden. They are illegal for this age until a coach or parent turns them on in Training.</p>
          ) : null}
          {view.mine.length ? (
            <section aria-label="My techniques">
              <h2 className="student-picker__category">My techniques</h2>
              {view.mine.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="student-picker__item"
                  onClick={() => {
                    set(picker, { id: '', name });
                    setPicker(null);
                  }}
                >
                  {name}
                </button>
              ))}
            </section>
          ) : null}
          {view.categories.map((category) => (
            <section key={category.id}>
              <h2 className="student-picker__category">{category.name}</h2>
              {category.items.map((item) => (
                <button
                  key={`${item.catalogItemId}-${item.entryId}-${item.name}`}
                  type="button"
                  className="student-picker__item"
                  onClick={() => {
                    set(picker, { id: linkId(item), name: item.label });
                    setPicker(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </section>
          ))}
          {!view.mine.length && !view.categories.length ? <p className="student-quiet">No techniques match. Close and type it in.</p> : null}
        </div>
      )}
    </>
  );
}
