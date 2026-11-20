/**
 * Structured Belt Chain editor that stays in sync with saved profile.lineage text.
 * Every ancestor uses a belt bar, including the root master. Suggestions are labeled
 * Suggested and never include a source link.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  LINEAGE_STEP_CAP,
  displayLineageSteps,
  formatLineageStep,
  masterFromName,
  normalizePersonName,
  parseLineage,
  parseLineageStep,
  remainingStepSlots,
  searchMasters,
  serializeLineage,
  suggestAncestors,
  type LineageStep,
  type SuggestedMaster,
} from '../lib/academyIdentity.ts';
import { AcademyBeltBar } from './AcademyBeltChain.tsx';

const EMPTY_SUGGESTIONS: readonly SuggestedMaster[] = [];

export function AcademyLineageEditor({
  value,
  onChange,
  maxLength = 240,
  initialSuggestions = EMPTY_SUGGESTIONS,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  initialSuggestions?: readonly SuggestedMaster[];
}) {
  const accepted = useMemo(() => displayLineageSteps(parseLineage(value)), [value]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SuggestedMaster[]>(() => seedPending(initialSuggestions, accepted));

  useEffect(() => {
    setPending((current) => seedPending(current.length ? current : initialSuggestions, accepted));
  }, [value, initialSuggestions, accepted]);

  const hits = query.trim().length >= 2 ? searchMasters(query) : [];
  const slots = remainingStepSlots(accepted.length);
  const atCap = slots <= 0;

  const addMaster = (master: SuggestedMaster) => {
    if (atCap) return;
    if (accepted.some((step) => normalizePersonName(step.name) === normalizePersonName(master.name))) {
      setQuery('');
      setOpen(false);
      return;
    }
    const nextStep = parseLineageStep(formatLineageStep({ title: master.title, name: master.name }));
    const nextAccepted = [...accepted, nextStep];
    onChange(clip(serializeLineage(nextAccepted), maxLength));
    const ancestors = suggestAncestors(
      master.name,
      nextAccepted.map((step) => step.name),
      3,
    ).slice()
      .reverse();
    setPending(ancestors);
    setQuery('');
    setOpen(false);
  };

  const addQuery = () => {
    const name = query.trim();
    if (!name) return;
    const match = searchMasters(name, 1)[0];
    addMaster(match && normalizePersonName(match.name) === normalizePersonName(name) ? match : masterFromName(name));
  };

  const acceptSuggestion = (master: SuggestedMaster) => {
    if (atCap) return;
    const nextStep = parseLineageStep(formatLineageStep({ title: master.title, name: master.name }));
    const nextAccepted = [nextStep, ...accepted];
    onChange(clip(serializeLineage(nextAccepted), maxLength));
    setPending((current) => current.filter((row) => normalizePersonName(row.name) !== normalizePersonName(master.name)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...accepted];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    const hold = next[index]!;
    next[index] = next[swap]!;
    next[swap] = hold;
    onChange(clip(serializeLineage(next), maxLength));
  };

  const removeAt = (index: number) => {
    const next = accepted.filter((_, item) => item !== index);
    onChange(clip(serializeLineage(next), maxLength));
  };

  const reverse = () => {
    if (accepted.length < 2) return;
    onChange(clip(serializeLineage([...accepted].reverse()), maxLength));
  };

  return (
    <div className="acad-editor" data-testid="academy-lineage-editor">
      {pending.length ? (
        <ul className="acad-editor__steps" data-testid="lineage-suggested">
          {pending.map((master) => (
            <li key={master.name} className="acad-editor__step acad-editor__step--suggested">
              <AcademyBeltBar belt={parseLineageStep(formatLineageStep(master)).belt} />
              <div className="acad-node__copy">
                <div className="acad-node__name">{master.name}</div>
                <div className="acad-node__title">{master.title}</div>
                <span className="acad-editor__badge">Suggested</span>
              </div>
              <div className="acad-editor__actions">
                <button type="button" className="acad-editor__accept" onClick={() => acceptSuggestion(master)} disabled={atCap}>
                  Accept
                </button>
                <button
                  type="button"
                  className="acad-editor__ghost"
                  onClick={() => {
                    setQuery(master.name);
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {accepted.length ? (
        <ul className="acad-editor__steps" data-testid="lineage-accepted">
          {accepted.map((step, index) => (
            <li key={`${step.name}-${index}`} className="acad-editor__step">
              <AcademyBeltBar belt={step.belt} />
              <div className="acad-node__copy">
                <div className="acad-node__name">{step.name}</div>
                {step.title ? <div className="acad-node__title">{step.title}</div> : null}
              </div>
              <div className="acad-editor__actions">
                <button type="button" className="acad-editor__ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${step.name} up`}>
                  Up
                </button>
                <button type="button" className="acad-editor__ghost" onClick={() => move(index, 1)} disabled={index === accepted.length - 1} aria-label={`Move ${step.name} down`}>
                  Down
                </button>
                <button type="button" className="acad-editor__ghost" onClick={() => removeAt(index)} aria-label={`Remove ${step.name}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {accepted.length >= 2 ? (
        <button type="button" className="acad-editor__ghost acad-editor__reverse" onClick={reverse}>
          Reverse order
        </button>
      ) : null}

      <div className="acad-editor__add">
        <input
          type="text"
          value={query}
          maxLength={80}
          placeholder={atCap ? 'Name limit reached' : 'Add a teacher…'}
          aria-label="Add a teacher"
          autoComplete="off"
          disabled={atCap}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addQuery();
            }
          }}
        />
        {open && hits.length ? (
          <ul className="acad-typeahead" data-testid="lineage-typeahead">
            <li className="acad-typeahead__cap">Suggestions</li>
            {hits.map((master) => (
              <li key={master.name}>
                <button type="button" className="acad-typeahead__opt" onClick={() => addMaster(master)}>
                  <span className="acad-typeahead__who">{master.name}</span>
                  <span className="acad-typeahead__of">{master.teacherNote}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="gym-sheet__note">
        Names can also be typed in the box below, separated by commas, new lines, or {'>'}. Up to {LINEAGE_STEP_CAP} teachers.
      </p>
    </div>
  );
}

function seedPending(suggestions: readonly SuggestedMaster[], accepted: readonly LineageStep[]): SuggestedMaster[] {
  const have = new Set(accepted.map((step) => normalizePersonName(step.name)));
  return suggestions.filter((row) => !have.has(normalizePersonName(row.name)));
}

function clip(text: string, max: number): string {
  return text.slice(0, max);
}
