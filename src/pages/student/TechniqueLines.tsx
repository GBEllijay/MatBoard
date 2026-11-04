/**
 * "Technique drilled" as lines, like the coach's daily video section: each line
 * is a technique name (free text, suggestions from fundamentals + My techniques),
 * a "What I learned" note, and an optional "On my fundamentals list?" link.
 * Pick opens the fundamentals list with a search box and a My techniques section.
 */
import { useId, useMemo, useState } from 'react';
import type { StudentProgressReport } from '../../lib/progress/types';
import { ageIllegalTechniques } from '../../lib/studentBenchmarks';
import {
  JOURNAL_TECHNIQUE_MAX,
  fundamentalsBoard,
  isFundamentalLink,
  techniqueDrilledLabel,
  techniqueNoteLabel,
  type FundamentalRow,
  type JournalTechniqueLine,
} from '../../lib/studentEdition';
import { techniqueKey, techniquePicker, techniqueSuggestions } from '../../lib/techniqueIndex';

export type TechniqueLineRow = { id: string; name: string; note: string };

export function blankTechniqueLines(count: number): TechniqueLineRow[] {
  return Array.from({ length: count }, () => ({ id: '', name: '', note: '' }));
}

export function techniqueLinesFrom(rows: readonly JournalTechniqueLine[], min: number): TechniqueLineRow[] {
  const out = rows.map((row) => ({ id: row.id, name: row.name, note: row.note ?? '' }));
  while (out.length < min) out.push({ id: '', name: '', note: '' });
  return out;
}

const linkId = (item: FundamentalRow) => item.catalogItemId || item.entryId;

export function TechniqueLines({
  idPrefix,
  report,
  rows,
  onChange,
}: {
  idPrefix: string;
  report: StudentProgressReport;
  rows: TechniqueLineRow[];
  onChange: (next: TechniqueLineRow[]) => void;
}) {
  const listId = `technique-suggestions-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [picker, setPicker] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const suggestions = useMemo(() => techniqueSuggestions(report), [report]);
  const board = useMemo(() => fundamentalsBoard(report), [report]);
  const set = (index: number, patch: Partial<TechniqueLineRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const open = (index: number, query = '') => {
    setSearch(query);
    setPicker(index);
  };
  const linkByName = (index: number) => {
    const key = techniqueKey(rows[index]?.name ?? '');
    for (const category of board)
      for (const item of category.items)
        if (key && (techniqueKey(item.label) === key || techniqueKey(item.name) === key)) {
          set(index, { id: linkId(item), name: item.label });
          return;
        }
    open(index, rows[index]?.name ?? '');
  };
  const view = picker === null ? null : techniquePicker(report, search);
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
                  set(index, { name, id: row.name === name ? row.id : '' });
                }}
              />
              <button type="button" className="student-pick" aria-label={`Pick ${idPrefix}${label} from fundamentals`} onClick={() => open(index)}>
                Pick
              </button>
            </label>
            <label className="ink ink--wobble journal-note technique-line__note">
              <span className="ink__label">What I learned</span>
              <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label={`${idPrefix}${techniqueNoteLabel(index)}`} rows={2} maxLength={400} value={row.note} onChange={(event) => set(index, { note: event.target.value })} />
            </label>
            <label className="technique-line__link">
              <input
                type="checkbox"
                aria-label={`${idPrefix}On my fundamentals list? #${index + 1}`}
                checked={linked}
                onChange={(event) => (event.target.checked ? linkByName(index) : set(index, { id: '' }))}
              />
              <span>On my fundamentals list?</span>
            </label>
          </div>
        );
      })}
      {rows.length < JOURNAL_TECHNIQUE_MAX ? (
        <button type="button" className="ink-btn ink-btn--small" onClick={() => onChange([...rows, { id: '', name: '', note: '' }])}>
          Add another technique
        </button>
      ) : null}
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
