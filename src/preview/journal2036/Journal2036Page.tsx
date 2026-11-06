import { useState } from 'react';
import { formatJournalDate } from '../../lib/journalCopy';
import {
  INJURY_ZONES,
  MAT_KINDS,
  MAT_KIND_LABEL,
  PREVIEW_BANNER,
  PREVIEW_JOURNAL_PATH,
  SAMPLE_LESSON_PLAN,
  addLocalItem,
  analyticsLine,
  canAddLocal,
  filterAcademy,
  fundamentalName,
  learnedSuggestions,
  lessonExpectedMinutes,
  linkDrill,
  matTimeReadout,
  nextDrillId,
  seedPreview,
  stepMinutes,
  type CardMark,
  type DrillRow,
  type HiatusReason,
  type IndexItem,
  type PreviewEntry,
  type PreviewState,
} from './model';
import './journal2036.css';

const EXPECTED_MINUTES = lessonExpectedMinutes();

export function Journal2036Page() {
  const [state, setState] = useState<PreviewState>(() => seedPreview());
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const { entry, academyIndex, localIndex } = state;

  const patch = (partial: Partial<PreviewEntry>) => {
    setState((prev) => ({ ...prev, entry: { ...prev.entry, ...partial } }));
  };

  const patchDrill = (id: string, partial: Partial<DrillRow>) => {
    setState((prev) => ({
      ...prev,
      entry: {
        ...prev.entry,
        drills: prev.entry.drills.map((row) => (row.id === id ? { ...row, ...partial } : row)),
      },
    }));
  };

  const reset = () => {
    setState(seedPreview());
    setSuggestFor(null);
    setPickerFor(null);
    setPickerQuery('');
  };

  return (
    <main className="j2036">
      <div className="j2036-shell">
        <p className="j2036-banner" role="note" data-testid="preview-banner">
          {PREVIEW_BANNER}
        </p>
        <p className="j2036-kicker">2036</p>
        <h1>Advantage</h1>
        <p className="j2036-sub">Student journal</p>
        <p className="j2036-path" data-testid="preview-path">
          {PREVIEW_JOURNAL_PATH}
        </p>
        <p className="j2036-quiet">Changes on this screen stay in the preview. They are not written to the live journal.</p>
        <form
          className="j2036-layout"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <LessonCard />
          <MatCard entry={entry} academyIndex={academyIndex} onPatch={patch} />
          <NotesCard entry={entry} onPatch={patch} />
          <MarksCard entry={entry} onPatch={patch} />
          <DrillsCard
            entry={entry}
            academyIndex={academyIndex}
            localIndex={localIndex}
            suggestFor={suggestFor}
            pickerFor={pickerFor}
            pickerQuery={pickerQuery}
            onSuggest={setSuggestFor}
            onPicker={(id) => {
              setPickerFor(id);
              setPickerQuery('');
              setSuggestFor(null);
            }}
            onPickerQuery={setPickerQuery}
            onPatchDrill={patchDrill}
            onAddLocal={(name) => {
              setState((prev) => ({ ...prev, localIndex: addLocalItem(prev.localIndex, name, prev.academyIndex) }));
              setSuggestFor(null);
            }}
            onAddDrill={() => {
              setState((prev) => ({
                ...prev,
                entry: {
                  ...prev.entry,
                  drills: [...prev.entry.drills, { id: nextDrillId(prev.entry.drills), drill: '', learned: '', fundamentalId: '' }],
                },
              }));
            }}
            onLink={(drillId, fundamentalId) => {
              setState((prev) => ({
                ...prev,
                entry: { ...prev.entry, drills: linkDrill(prev.entry.drills, drillId, fundamentalId) },
              }));
              setPickerFor(null);
            }}
          />
          <IndexCard academyIndex={academyIndex} localIndex={localIndex} onReset={reset} />
        </form>
      </div>
    </main>
  );
}

function LessonCard() {
  return (
    <section className="j2036-card j2036-lesson" aria-label="Today's lesson plan">
      <h2>Today&apos;s lesson plan</h2>
      <p>
        {SAMPLE_LESSON_PLAN.coach} · {SAMPLE_LESSON_PLAN.title}
      </p>
      <p className="j2036-quiet">The instructor sends the plan down. This journal only reads it.</p>
      <ul className="j2036-plan" data-surface="app" data-testid="lesson-blocks">
        {SAMPLE_LESSON_PLAN.blocks.map((block) => (
          <li key={block.name}>
            {block.name} · {block.minutes} min
          </li>
        ))}
      </ul>
      <p className="j2036-expected" data-testid="lesson-expected" data-minutes={EXPECTED_MINUTES}>
        Expected duration from today&apos;s lesson plan: {EXPECTED_MINUTES} min
      </p>
    </section>
  );
}

function MatCard({
  entry,
  academyIndex,
  onPatch,
}: {
  entry: PreviewEntry;
  academyIndex: readonly IndexItem[];
  onPatch: (partial: Partial<PreviewEntry>) => void;
}) {
  const untimed = entry.matKind === 'untimed';
  return (
    <section className="j2036-card j2036-mat" aria-label="Mat time">
      <h2>Mat time</h2>
      <div className="j2036-kinds" role="group" aria-label="Mat time kind">
        {MAT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="j2036-chip"
            data-surface="app"
            aria-pressed={entry.matKind === kind}
            onClick={() => onPatch({ matKind: kind })}
          >
            {MAT_KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      <p className="j2036-readout" data-testid="mat-time-readout">
        {matTimeReadout(entry)}
      </p>
      <div className="j2036-stepper">
        <button
          type="button"
          className="j2036-btn"
          data-surface="app"
          aria-label="Less time"
          disabled={untimed || entry.minutes <= 15}
          onClick={() => onPatch({ minutes: stepMinutes(entry.minutes, -15) })}
        >
          Less time
        </button>
        <button
          type="button"
          className="j2036-btn"
          data-surface="app"
          aria-label="More time"
          disabled={untimed || entry.minutes >= 180}
          onClick={() => onPatch({ minutes: stepMinutes(entry.minutes, 15) })}
        >
          More time
        </button>
      </div>
      {entry.matKind === 'misc' ? (
        <label className="j2036-field">
          <span className="j2036-label">What was it</span>
          <input
            className="j2036-line"
            data-surface="notebook"
            type="text"
            aria-label="What was it"
            value={entry.miscNote}
            maxLength={80}
            spellCheck
            onChange={(event) => onPatch({ miscNote: event.target.value })}
          />
        </label>
      ) : null}
      <label className="j2036-check" data-surface="app">
        <input
          type="checkbox"
          data-surface="app"
          aria-label="Count this entry toward comprehensive analytics"
          checked={entry.countTowardAnalytics}
          onChange={(event) => onPatch({ countTowardAnalytics: event.target.checked })}
        />
        <span>Count this entry toward comprehensive analytics</span>
      </label>
      <p className="j2036-status" data-testid="analytics-status">
        {analyticsLine(entry, academyIndex)}
      </p>
    </section>
  );
}

function NotesCard({ entry, onPatch }: { entry: PreviewEntry; onPatch: (partial: Partial<PreviewEntry>) => void }) {
  return (
    <section className="j2036-card j2036-notes" aria-label="Session notes">
      <h2>Session</h2>
      <label className="j2036-field">
        <span className="j2036-label">Date</span>
        <input
          className="j2036-control"
          data-surface="app"
          type="date"
          aria-label="Date"
          value={entry.date}
          onChange={(event) => onPatch({ date: event.target.value })}
        />
        <span className="j2036-date-read">{formatJournalDate(entry.date)}</span>
      </label>
      <label className="j2036-field">
        <span className="j2036-label">Class</span>
        <input
          className="j2036-line"
          data-surface="notebook"
          type="text"
          aria-label="Class"
          value={entry.className}
          maxLength={80}
          spellCheck
          onChange={(event) => onPatch({ className: event.target.value })}
        />
      </label>
      <label className="j2036-field">
        <span className="j2036-label">Training partners</span>
        <textarea
          className="j2036-line"
          data-surface="notebook"
          aria-label="Training partners"
          rows={3}
          value={entry.partners}
          spellCheck
          onChange={(event) => onPatch({ partners: event.target.value })}
        />
      </label>
      <label className="j2036-field">
        <span className="j2036-label">How it went</span>
        <textarea
          className="j2036-line"
          data-surface="notebook"
          aria-label="How it went"
          rows={3}
          maxLength={400}
          value={entry.howItWent}
          spellCheck
          onChange={(event) => onPatch({ howItWent: event.target.value })}
        />
      </label>
    </section>
  );
}

function MarksCard({ entry, onPatch }: { entry: PreviewEntry; onPatch: (partial: Partial<PreviewEntry>) => void }) {
  const marks: { id: CardMark; label: string }[] = [
    { id: 'none', label: 'No mark' },
    { id: 'injury', label: 'Injury' },
    { id: 'break', label: 'Break' },
    { id: 'hiatus', label: 'Hiatus' },
  ];
  return (
    <section className="j2036-card j2036-marks" aria-label="Mark card">
      <h2>Mark card (optional)</h2>
      <p className="j2036-quiet">Injury, a break, or a hiatus. Leave this on No mark for an ordinary session.</p>
      <div className="j2036-marks" role="group" aria-label="Card mark">
        {marks.map((mark) => (
          <button
            key={mark.id}
            type="button"
            className="j2036-chip"
            data-surface="app"
            aria-pressed={entry.mark === mark.id}
            onClick={() => onPatch({ mark: mark.id })}
          >
            {mark.label}
          </button>
        ))}
      </div>
      {entry.mark === 'injury' ? (
        <div>
          <label className="j2036-field">
            <span className="j2036-label">Injury area</span>
            <input
              className="j2036-line"
              data-surface="notebook"
              type="text"
              aria-label="Injury area"
              value={entry.injuryArea}
              maxLength={80}
              spellCheck
              onChange={(event) => onPatch({ injuryArea: event.target.value })}
            />
          </label>
          <label className="j2036-field">
            <span className="j2036-label">Injury note</span>
            <textarea
              className="j2036-line"
              data-surface="notebook"
              aria-label="Injury note"
              rows={2}
              maxLength={320}
              value={entry.injuryNote}
              spellCheck
              onChange={(event) => onPatch({ injuryNote: event.target.value })}
            />
          </label>
          <label className="j2036-field">
            <span className="j2036-label">Body zone</span>
            <select
              className="j2036-control"
              data-surface="app"
              aria-label="Injury zone"
              value={entry.injuryZone}
              onChange={(event) => onPatch({ injuryZone: event.target.value })}
            >
              <option value="">Pick a zone</option>
              {INJURY_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {entry.mark === 'break' ? (
        <label className="j2036-field">
          <span className="j2036-label">Break</span>
          <textarea
            className="j2036-line"
            data-surface="notebook"
            aria-label="Break note"
            rows={2}
            maxLength={320}
            value={entry.breakNote}
            spellCheck
            placeholder="Sitting out this session"
            onChange={(event) => onPatch({ breakNote: event.target.value })}
          />
        </label>
      ) : null}
      {entry.mark === 'hiatus' ? (
        <div>
          <label className="j2036-field">
            <span className="j2036-label">Hiatus reason</span>
            <select
              className="j2036-control"
              data-surface="app"
              aria-label="Hiatus reason"
              value={entry.hiatusReason}
              onChange={(event) => onPatch({ hiatusReason: event.target.value as HiatusReason })}
            >
              <option value="medical">Medical</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="j2036-field">
            <span className="j2036-label">Hiatus starts</span>
            <input
              className="j2036-control"
              data-surface="app"
              type="date"
              aria-label="Hiatus start"
              value={entry.hiatusStart}
              onChange={(event) => onPatch({ hiatusStart: event.target.value })}
            />
          </label>
          <label className="j2036-field">
            <span className="j2036-label">Back on</span>
            <input
              className="j2036-control"
              data-surface="app"
              type="date"
              aria-label="Hiatus end"
              value={entry.hiatusEnd}
              onChange={(event) => onPatch({ hiatusEnd: event.target.value })}
            />
          </label>
          <label className="j2036-field">
            <span className="j2036-label">Hiatus note</span>
            <textarea
              className="j2036-line"
              data-surface="notebook"
              aria-label="Hiatus note"
              rows={2}
              maxLength={320}
              value={entry.hiatusNote}
              spellCheck
              onChange={(event) => onPatch({ hiatusNote: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}

function DrillsCard({
  entry,
  academyIndex,
  localIndex,
  suggestFor,
  pickerFor,
  pickerQuery,
  onSuggest,
  onPicker,
  onPickerQuery,
  onPatchDrill,
  onAddLocal,
  onAddDrill,
  onLink,
}: {
  entry: PreviewEntry;
  academyIndex: readonly IndexItem[];
  localIndex: readonly IndexItem[];
  suggestFor: string | null;
  pickerFor: string | null;
  pickerQuery: string;
  onSuggest: (id: string | null) => void;
  onPicker: (id: string | null) => void;
  onPickerQuery: (query: string) => void;
  onPatchDrill: (id: string, partial: Partial<DrillRow>) => void;
  onAddLocal: (name: string) => void;
  onAddDrill: () => void;
  onLink: (drillId: string, fundamentalId: string) => void;
}) {
  return (
    <section className="j2036-card j2036-drills" aria-label="Drills">
      <h2>Drills</h2>
      <p className="j2036-quiet">Link a drill to a fundamental from the academy index so mat time can count toward analytics and belt progress.</p>
      {entry.drills.map((row, index) => (
        <DrillRowView
          key={row.id}
          row={row}
          index={index}
          academyIndex={academyIndex}
          localIndex={localIndex}
          openSuggest={suggestFor === row.id}
          openPicker={pickerFor === row.id}
          pickerQuery={pickerQuery}
          onSuggest={onSuggest}
          onPicker={onPicker}
          onPickerQuery={onPickerQuery}
          onPatch={(partial) => onPatchDrill(row.id, partial)}
          onAddLocal={onAddLocal}
          onLink={(fundamentalId) => onLink(row.id, fundamentalId)}
        />
      ))}
      {entry.drills.length < 8 ? (
        <div className="j2036-actions">
          <button type="button" className="j2036-btn" data-surface="app" onClick={onAddDrill}>
            Add another drill
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DrillRowView({
  row,
  index,
  academyIndex,
  localIndex,
  openSuggest,
  openPicker,
  pickerQuery,
  onSuggest,
  onPicker,
  onPickerQuery,
  onPatch,
  onAddLocal,
  onLink,
}: {
  row: DrillRow;
  index: number;
  academyIndex: readonly IndexItem[];
  localIndex: readonly IndexItem[];
  openSuggest: boolean;
  openPicker: boolean;
  pickerQuery: string;
  onSuggest: (id: string | null) => void;
  onPicker: (id: string | null) => void;
  onPickerQuery: (query: string) => void;
  onPatch: (partial: Partial<DrillRow>) => void;
  onAddLocal: (name: string) => void;
  onLink: (fundamentalId: string) => void;
}) {
  const n = index + 1;
  const linked = fundamentalName(academyIndex, row.fundamentalId);
  const suggestions = openSuggest ? learnedSuggestions(row.learned, academyIndex, localIndex) : [];
  const query = row.learned.trim().toLowerCase();
  const stillSearching = suggestions.some((item) => item.name.toLowerCase().startsWith(query));
  const allowAdd = openSuggest && canAddLocal(row.learned, academyIndex, localIndex) && !stillSearching;
  const pickerItems = openPicker ? filterAcademy(academyIndex, pickerQuery) : [];
  const categories = [...new Set(pickerItems.map((item) => item.category))];
  return (
    <article className="j2036-drill" data-testid="drill-row">
      <h3>Drill {n}</h3>
      <p className="j2036-link" data-testid={`drill-link-${row.id}`}>
        {linked ? `Linked to ${linked}` : 'Not linked to a fundamental'}
      </p>
      <label className="j2036-field">
        <span className="j2036-label">Drill</span>
        <input
          className="j2036-line"
          data-surface="notebook"
          type="text"
          aria-label={`Drill ${n}`}
          value={row.drill}
          maxLength={80}
          spellCheck
          onChange={(event) => onPatch({ drill: event.target.value })}
        />
      </label>
      <label className="j2036-field">
        <span className="j2036-label">What I learned</span>
        <textarea
          className="j2036-line"
          data-surface="notebook"
          aria-label={`What I learned ${n}`}
          rows={2}
          maxLength={400}
          value={row.learned}
          spellCheck
          onChange={(event) => {
            onPatch({ learned: event.target.value });
            onSuggest(event.target.value.trim().length >= 2 ? row.id : null);
          }}
        />
      </label>
      {openSuggest && (suggestions.length > 0 || allowAdd) ? (
        <div className="j2036-suggest" data-surface="app">
          {suggestions.length > 0 ? (
            <div className="j2036-menu" role="listbox" data-surface="app" aria-label={`Suggestions for what I learned ${n}`}>
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  data-surface="app"
                  aria-label={item.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPatch({ learned: item.name });
                    onSuggest(null);
                  }}
                >
                  <span>{item.name}</span>
                  <small className="j2036-source">{item.source === 'academy' ? 'Academy index' : 'My list'}</small>
                </button>
              ))}
            </div>
          ) : null}
          {allowAdd ? (
            <button
              type="button"
              className="j2036-btn"
              data-surface="app"
              aria-label="Add to my list"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAddLocal(row.learned)}
            >
              Add to my list
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="j2036-row-actions">
        <button type="button" className="j2036-btn" data-surface="app" aria-label={`Link fundamental for drill ${n}`} onClick={() => onPicker(openPicker ? null : row.id)}>
          {openPicker ? 'Close' : 'Link fundamental'}
        </button>
      </div>
      {openPicker ? (
        <div className="j2036-picker" role="dialog" data-surface="app" aria-label={`Link a fundamental for drill ${n}`}>
          <label className="j2036-field">
            <span className="j2036-label">Search the index</span>
            <input
              className="j2036-line"
              data-surface="notebook"
              type="search"
              aria-label="Search fundamentals"
              value={pickerQuery}
              onChange={(event) => onPickerQuery(event.target.value)}
            />
          </label>
          {categories.map((category) => (
            <section key={category} aria-label={category}>
              <h3 className="j2036-label">{category}</h3>
              <div className="j2036-menu" data-surface="app">
                {pickerItems
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <button key={item.id} type="button" data-surface="app" aria-label={item.name} onClick={() => onLink(item.id)}>
                      {item.name}
                    </button>
                  ))}
              </div>
            </section>
          ))}
          {pickerItems.length === 0 ? <p className="j2036-quiet">No fundamentals match.</p> : null}
          <div className="j2036-actions">
            <button type="button" className="j2036-btn" data-surface="app" onClick={() => onLink('')}>
              Clear link
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function IndexCard({
  academyIndex,
  localIndex,
  onReset,
}: {
  academyIndex: readonly IndexItem[];
  localIndex: readonly IndexItem[];
  onReset: () => void;
}) {
  return (
    <section className="j2036-card j2036-index" aria-label="Technique index">
      <div className="j2036-index__cols">
        <div>
          <h2>Academy index</h2>
          <p className="j2036-quiet">Pushed down by the instructor. Students cannot add to this list.</p>
          <ul data-testid="academy-index" data-surface="app" aria-readonly="true">
            {academyIndex.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2>My list</h2>
          <p className="j2036-quiet">On this screen only. Adding here does not write back to the academy index.</p>
          <ul data-testid="local-index" data-surface="app">
            {localIndex.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="j2036-actions">
        <button type="button" className="j2036-btn" data-surface="app" onClick={onReset}>
          Reset to sample
        </button>
      </div>
    </section>
  );
}
