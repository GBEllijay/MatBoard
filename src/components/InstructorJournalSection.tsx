/**
 * Instructor journal (after-class reflections, class video hub, and shareable
 * student takeaways) + teaching goals checklist.
 *
 * Lives beside the Instructor D12 on Instructor Edition and in sandbox mode on
 * /preview/instructor-sheet. Writes only matboard.instructor.journal.v1 and
 * matboard.instructor.goals.v1 (never student journal, D12 cards, or Cloud).
 *
 * TODO: Connect buildStudentShareBundle() to the owner-gated video/card
 * distribution flow (PR 529 area) after explicit owner approval.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { INSTRUCTOR_D12_FACES } from '../lib/instructorD12';
import { cleanD12Video, type InstructorD12Card } from '../lib/instructorD12Cards';
import { d12FaceEndpoint } from '../lib/instructorD12Mastery';
import { formatJournalDate } from '../lib/journalCopy';
import {
  addInstructorGoal,
  addInstructorJournalEntry,
  addInstructorJournalVideo,
  buildStudentShareBundle,
  deleteInstructorGoal,
  deleteInstructorJournalEntry,
  instructorTagLabel,
  parseTechniqueInput,
  removeInstructorJournalVideo,
  toggleInstructorGoal,
  toggleJournalFieldShare,
  toggleJournalTechniqueShare,
  toggleJournalVideoShare,
  todayLocalIso,
  type InstructorGoal,
  type InstructorJournalEntry,
  type InstructorJournalVideo,
} from '../lib/instructorJournal';
import { fetchPublishedSchedule, resolveGymSchedule } from '../lib/gymSchedulePublish';
import { occurrencesOnDate, type GymCalendarState, type GymClassOccurrence } from '../lib/gymCalendar';
import { techniquesFromLessonPlans } from '../lib/classRecap';
import { InstructorClassRoster } from './InstructorClassRoster';
import type { Student } from '../lib/rosterStore';
import './instructorJournal.css';

type Props = {
  entries: readonly InstructorJournalEntry[];
  goals: readonly InstructorGoal[];
  cards: readonly InstructorD12Card[];
  rosterNames?: readonly string[];
  roster?: readonly Student[];
  sandbox?: boolean;
  onChangeEntries: (next: InstructorJournalEntry[]) => void;
  onChangeGoals: (next: InstructorGoal[]) => void;
};

export function InstructorJournalSection({
  entries,
  goals,
  cards,
  rosterNames = [],
  roster = [],
  sandbox = false,
  onChangeEntries,
  onChangeGoals,
}: Props) {
  const [date, setDate] = useState(() => todayLocalIso());
  const [classLabel, setClassLabel] = useState('');
  const [whoInClass, setWhoInClass] = useState('');
  const [whoInClassIds, setWhoInClassIds] = useState<string[]>([]);
  const [slotId, setSlotId] = useState('');
  const [schedule, setSchedule] = useState<GymCalendarState | null>(() => resolveGymSchedule({ storage: typeof localStorage === 'undefined' ? null : localStorage }).schedule);
  const [reflection, setReflection] = useState('');
  const [shareReflection, setShareReflection] = useState(false);
  const [classNotes, setClassNotes] = useState('');
  const [shareClassNotes, setShareClassNotes] = useState(false);
  const [techniquesText, setTechniquesText] = useState('');
  const [shareTechniques, setShareTechniques] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftVideos, setDraftVideos] = useState<InstructorJournalVideo[]>([]);
  const [draftVideoTitle, setDraftVideoTitle] = useState('');
  const [draftVideoHref, setDraftVideoHref] = useState('');
  const [draftVideoShare, setDraftVideoShare] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const [goalText, setGoalText] = useState('');
  const [goalTag, setGoalTag] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);

  const tagOptions = useMemo(
    () => [
      ...cards.map((card) => ({ value: card.id, label: `Card · ${card.name}` })),
      ...INSTRUCTOR_D12_FACES.map((face) => ({ value: d12FaceEndpoint(face.id), label: `Face · ${face.label}` })),
    ],
    [cards],
  );

  useEffect(() => {
    let alive = true;
    void fetchPublishedSchedule().then((result) => {
      if (alive) setSchedule(result.schedule);
    });
    return () => {
      alive = false;
    };
  }, []);

  const daySlots: GymClassOccurrence[] = useMemo(
    () => (schedule ? occurrencesOnDate(schedule, date) : []),
    [schedule, date],
  );
  const selectedSlot = daySlots.find((item) => item.slotId === slotId) ?? null;

  const fillLessonTechniques = () => {
    const names = techniquesFromLessonPlans(date);
    if (!names.length) {
      setEntryError('No techniques are on the lesson plan for this date.');
      return;
    }
    setEntryError(null);
    const current = techniquesText
      .split(/[\n,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const seen = new Set(current.map((name) => name.toLocaleLowerCase()));
    const added = names.filter((name) => !seen.has(name.toLocaleLowerCase()));
    setTechniquesText([...current, ...added].join(', '));
  };

  const appendRosterName = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const current = whoInClass
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (current.some((part) => part.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    setWhoInClass([...current, clean].join(', '));
  };

  const addDraftVideo = () => {
    const clean = cleanD12Video(draftVideoTitle, draftVideoHref, draftVideoShare);
    if (!clean) {
      setEntryError('Paste a video link that starts with https://');
      return;
    }
    setEntryError(null);
    if (!draftVideos.some((video) => video.href === clean.href)) {
      setDraftVideos([...draftVideos, clean]);
    }
    setDraftVideoTitle('');
    setDraftVideoHref('');
    setDraftVideoShare(false);
  };

  const submitEntry = (event: FormEvent) => {
    event.preventDefault();
    const added = addInstructorJournalEntry(entries, {
      date,
      classLabel,
      slotId,
      whoInClass,
      whoInClassIds,
      reflection,
      shareReflection,
      classNotes,
      shareClassNotes,
      techniques: parseTechniqueInput(techniquesText, shareTechniques),
      tags: draftTags,
      videos: draftVideos,
    });
    if ('error' in added) {
      setEntryError('Write a reflection, class note, technique, or video link first.');
      return;
    }
    onChangeEntries(added.entries);
    setClassLabel('');
    setSlotId('');
    setWhoInClass('');
    setWhoInClassIds([]);
    setReflection('');
    setShareReflection(false);
    setClassNotes('');
    setShareClassNotes(false);
    setTechniquesText('');
    setShareTechniques(false);
    setDraftTags([]);
    setDraftVideos([]);
    setDraftVideoTitle('');
    setDraftVideoHref('');
    setDraftVideoShare(false);
    setEntryError(null);
  };

  const submitGoal = (event: FormEvent) => {
    event.preventDefault();
    const added = addInstructorGoal(goals, goalText, goalTag || undefined);
    if ('error' in added) {
      setGoalError('Write a goal first.');
      return;
    }
    onChangeGoals(added.goals);
    setGoalText('');
    setGoalTag('');
    setGoalError(null);
  };

  return (
    <div className="ij-wrap" data-testid="instructor-journal-section">
      <p className="ip-quiet">
        {sandbox
          ? 'Fictional sample reflections, class videos, and goals. Anything you add here stays on this page only and is never saved.'
          : 'After-class reflections, class video links, and teaching goals. Entries mentioning or tagged to a D12 card show up on that card.'}
      </p>

      <div className="ij-split">
        <section className="ij-panel" aria-label="Class reflections" data-testid="instructor-journal">
          <h3>Class journal</h3>
          <form className="ij-form" onSubmit={submitEntry} data-testid="ij-entry-form">
            <div className="ij-row">
              <label className="ij-field">
                <span>Date</span>
                <input
                  type="date"
                  aria-label="Class date"
                  data-testid="ij-date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="ij-field">
                <span>Class / time (optional)</span>
                <input
                  type="text"
                  aria-label="Class or time"
                  data-testid="ij-class-label"
                  placeholder="e.g. 6:00 PM Fundamentals"
                  value={classLabel}
                  onChange={(event) => setClassLabel(event.target.value)}
                />
              </label>
            </div>

            <label className="ij-field">
              <span>Who was in class (optional)</span>
              <input
                type="text"
                aria-label="Who was in class"
                data-testid="ij-who"
                placeholder="Names or group note"
                value={whoInClass}
                onChange={(event) => setWhoInClass(event.target.value)}
              />
            </label>
            {rosterNames.length > 0 ? (
              <div className="ij-roster-picks" aria-label="Quick pick from student roster">
                {rosterNames.slice(0, 10).map((name) => (
                  <button key={name} type="button" className="ij-chip" onClick={() => appendRosterName(name)}>
                    {`+ ${name}`}
                  </button>
                ))}
              </div>
            ) : null}

            <InstructorClassRoster
              date={date}
              slot={selectedSlot}
              slots={daySlots}
              onPickSlot={(next) => {
                setSlotId(next);
                const picked = daySlots.find((item) => item.slotId === next);
                if (picked) setClassLabel(picked.label);
              }}
              roster={roster}
              cards={cards}
              onPrefillWho={(names, ids) => {
                setWhoInClass(names);
                setWhoInClassIds(ids);
              }}
              sandbox={sandbox}
            />

            <label className="ij-field">
              <span>After-class reflection (private by default)</span>
              <textarea
                rows={3}
                aria-label="After-class reflection"
                data-testid="ij-reflection"
                placeholder="Pacing, energy, what to adjust next class…"
                value={reflection}
                onChange={(event) => {
                  setReflection(event.target.value);
                  setEntryError(null);
                }}
              />
            </label>
            <label className="ij-check">
              <input
                type="checkbox"
                data-testid="ij-share-reflection"
                checked={shareReflection}
                onChange={(event) => setShareReflection(event.target.checked)}
              />
              <span>Share reflection with students</span>
            </label>

            <label className="ij-field">
              <span>Class notes for students (optional)</span>
              <textarea
                rows={2}
                aria-label="Class notes for students"
                data-testid="ij-class-notes"
                placeholder="Key cues or reminders useful for a student journal card…"
                value={classNotes}
                onChange={(event) => {
                  setClassNotes(event.target.value);
                  setEntryError(null);
                }}
              />
            </label>
            <label className="ij-check">
              <input
                type="checkbox"
                data-testid="ij-share-class-notes"
                checked={shareClassNotes}
                onChange={(event) => setShareClassNotes(event.target.checked)}
              />
              <span>Share with students</span>
            </label>

            <label className="ij-field">
              <span>Techniques covered (optional, comma-separated)</span>
              <input
                type="text"
                aria-label="Techniques covered"
                data-testid="ij-techniques"
                placeholder="e.g. Scissor sweep, Collar drag"
                value={techniquesText}
                onChange={(event) => {
                  setTechniquesText(event.target.value);
                  setEntryError(null);
                }}
              />
            </label>
            <button type="button" className="ij-btn-secondary" data-testid="ij-lesson-techniques" onClick={fillLessonTechniques}>
              Add techniques from today&apos;s lesson plan
            </button>
            <label className="ij-check">
              <input
                type="checkbox"
                data-testid="ij-share-techniques"
                checked={shareTechniques}
                onChange={(event) => setShareTechniques(event.target.checked)}
              />
              <span>Share techniques with students</span>
            </label>

            <label className="ij-field">
              <span>Tag a D12 card or face (instructor-only)</span>
              <select
                aria-label="Tag D12 card or face"
                data-testid="ij-tag-select"
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value && !draftTags.includes(value)) setDraftTags([...draftTags, value]);
                }}
              >
                <option value="">Add a D12 tag…</option>
                {tagOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {draftTags.length > 0 ? (
              <div className="ij-tags" data-testid="ij-draft-tags">
                {draftTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="ij-chip"
                    onClick={() => setDraftTags(draftTags.filter((item) => item !== tag))}
                  >
                    {`${instructorTagLabel(tag, cards) || tag} ×`}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="ij-video-draft">
              <span className="ij-sublabel">Class videos (local links only, off Cloud)</span>
              <div className="ij-row">
                <input
                  type="text"
                  aria-label="Draft video title"
                  data-testid="ij-draft-video-title"
                  placeholder="Video title"
                  value={draftVideoTitle}
                  onChange={(event) => setDraftVideoTitle(event.target.value)}
                />
                <input
                  type="text"
                  aria-label="Draft video link"
                  data-testid="ij-draft-video-href"
                  placeholder="https://"
                  value={draftVideoHref}
                  onChange={(event) => setDraftVideoHref(event.target.value)}
                />
              </div>
              <div className="ij-video-draft__actions">
                <label className="ij-check">
                  <input
                    type="checkbox"
                    data-testid="ij-draft-video-share"
                    checked={draftVideoShare}
                    onChange={(event) => setDraftVideoShare(event.target.checked)}
                  />
                  <span>Share with students</span>
                </label>
                <button type="button" className="ij-btn-secondary" data-testid="ij-draft-video-add" onClick={addDraftVideo}>
                  Add video
                </button>
              </div>
              {draftVideos.length > 0 ? (
                <ul className="ij-mini-list">
                  {draftVideos.map((video) => (
                    <li key={video.href}>
                      <span>{video.title}</span>
                      <button
                        type="button"
                        className="ij-link-btn"
                        onClick={() => setDraftVideos(draftVideos.filter((item) => item.href !== video.href))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {entryError ? (
              <p className="ij-error" role="alert">
                {entryError}
              </p>
            ) : null}
            <button type="submit" className="ip-log-btn" data-testid="ij-save-entry">
              Save entry
            </button>
          </form>

          {entries.length === 0 ? (
            <p className="ip-quiet" data-testid="ij-entries-empty">
              No journal entries yet. Add a reflection or class video above.
            </p>
          ) : (
            <ul className="ij-entries" data-testid="ij-entries">
              {entries.map((entry) => (
                <JournalEntryCard
                  key={entry.id}
                  entry={entry}
                  cards={cards}
                  roster={roster}
                  sandbox={sandbox}
                  onDelete={() => onChangeEntries(deleteInstructorJournalEntry(entries, entry.id))}
                  onToggleField={(field, share) => onChangeEntries(toggleJournalFieldShare(entries, entry.id, field, share))}
                  onToggleTech={(name, share) => onChangeEntries(toggleJournalTechniqueShare(entries, entry.id, name, share))}
                  onAddVideo={(title, href, share) => {
                    const result = addInstructorJournalVideo(entries, entry.id, title, href, share);
                    if ('entries' in result) {
                      onChangeEntries(result.entries);
                      return null;
                    }
                    return result.error === 'full' ? 'Entry already has the most videos it can hold.' : 'Paste a link that starts with https://';
                  }}
                  onRemoveVideo={(href) => onChangeEntries(removeInstructorJournalVideo(entries, entry.id, href))}
                  onToggleVideoShare={(href, share) => onChangeEntries(toggleJournalVideoShare(entries, entry.id, href, share))}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="ij-panel" aria-label="Teaching goals" data-testid="instructor-goals">
          <h3>Teaching goals</h3>
          <form className="ij-form" onSubmit={submitGoal} data-testid="ij-goal-form">
            <label className="ij-field">
              <span>Goal</span>
              <input
                type="text"
                aria-label="New teaching goal"
                data-testid="ij-goal-input"
                placeholder="e.g. Keep mat inspection under 3 minutes"
                value={goalText}
                onChange={(event) => {
                  setGoalText(event.target.value);
                  setGoalError(null);
                }}
              />
            </label>
            <label className="ij-field">
              <span>Tag D12 card or face (optional)</span>
              <select
                aria-label="Tag goal to D12 card or face"
                data-testid="ij-goal-tag"
                value={goalTag}
                onChange={(event) => setGoalTag(event.target.value)}
              >
                <option value="">No D12 tag</option>
                {tagOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {goalError ? (
              <p className="ij-error" role="alert">
                {goalError}
              </p>
            ) : null}
            <button type="submit" className="ip-log-btn" data-testid="ij-goal-add">
              Add goal
            </button>
          </form>

          {goals.length === 0 ? (
            <p className="ip-quiet" data-testid="ij-goals-empty">
              No teaching goals yet.
            </p>
          ) : (
            <ul className="ij-goals" data-testid="ij-goal-list">
              {goals.map((goal) => {
                const tagName = instructorTagLabel(goal.tag, cards);
                return (
                  <li key={goal.id} className={goal.done ? 'ij-goal is-done' : 'ij-goal'} data-goal-id={goal.id}>
                    <label className="ij-check ij-goal__label">
                      <input
                        type="checkbox"
                        checked={goal.done}
                        aria-label={`Mark ${goal.text} done`}
                        onChange={() => onChangeGoals(toggleInstructorGoal(goals, goal.id))}
                      />
                      <span>{goal.text}</span>
                    </label>
                    {tagName ? <span className="ij-tag-pill">{tagName}</span> : null}
                    <button
                      type="button"
                      className="ij-link-btn"
                      aria-label={`Delete goal ${goal.text}`}
                      onClick={() => onChangeGoals(deleteInstructorGoal(goals, goal.id))}
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function JournalEntryCard({
  entry,
  cards,
  roster,
  sandbox = false,
  onDelete,
  onToggleField,
  onToggleTech,
  onAddVideo,
  onRemoveVideo,
  onToggleVideoShare,
}: {
  entry: InstructorJournalEntry;
  cards: readonly InstructorD12Card[];
  roster: readonly Student[];
  sandbox?: boolean;
  onDelete: () => void;
  onToggleField: (field: 'reflection' | 'classNotes', share: boolean) => void;
  onToggleTech: (name: string, share: boolean) => void;
  onAddVideo: (title: string, href: string, share: boolean) => string | null;
  onRemoveVideo: (href: string) => void;
  onToggleVideoShare: (href: string, share: boolean) => void;
}) {
  const [videoTitle, setVideoTitle] = useState('');
  const [videoHref, setVideoHref] = useState('');
  const [videoShare, setVideoShare] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const bundle = useMemo(() => buildStudentShareBundle(entry, cards), [entry, cards]);
  const hasShareable = bundle.notes.length > 0 || bundle.techniques.length > 0 || bundle.videos.length > 0;

  const submitVideo = (event: FormEvent) => {
    event.preventDefault();
    const err = onAddVideo(videoTitle, videoHref, videoShare);
    if (err) {
      setVideoError(err);
      return;
    }
    setVideoError(null);
    setVideoTitle('');
    setVideoHref('');
    setVideoShare(false);
  };

  return (
    <li className="ij-entry" data-entry-id={entry.id}>
      <div className="ij-entry__head">
        <div>
          <strong>{formatJournalDate(entry.date)}</strong>
          {entry.classLabel ? <span className="ij-entry__class">{` · ${entry.classLabel}`}</span> : null}
        </div>
        <button type="button" className="ij-link-btn" data-testid={`ij-delete-${entry.id}`} onClick={onDelete}>
          Delete
        </button>
      </div>

      {entry.whoInClass ? (
        <p className="ij-meta" data-testid="ij-entry-who">
          <strong>In class:</strong> {entry.whoInClass}
        </p>
      ) : null}

      {entry.tags && entry.tags.length > 0 ? (
        <div className="ij-tags">
          {entry.tags.map((tag) => (
            <span key={tag} className="ij-tag-pill">
              {instructorTagLabel(tag, cards) || tag}
            </span>
          ))}
        </div>
      ) : null}

      {entry.reflection ? (
        <div className="ij-block">
          <p className="ij-body">{entry.reflection}</p>
          <label className="ij-check">
            <input
              type="checkbox"
              data-testid={`ij-entry-share-reflection-${entry.id}`}
              checked={entry.shareReflection === true}
              onChange={(event) => onToggleField('reflection', event.target.checked)}
            />
            <span>Share with students</span>
          </label>
        </div>
      ) : null}

      {entry.classNotes ? (
        <div className="ij-block">
          <p className="ij-sublabel">Class notes</p>
          <p className="ij-body">{entry.classNotes}</p>
          <label className="ij-check">
            <input
              type="checkbox"
              data-testid={`ij-entry-share-notes-${entry.id}`}
              checked={entry.shareClassNotes === true}
              onChange={(event) => onToggleField('classNotes', event.target.checked)}
            />
            <span>Share with students</span>
          </label>
        </div>
      ) : null}

      {entry.techniques && entry.techniques.length > 0 ? (
        <div className="ij-block">
          <p className="ij-sublabel">Techniques covered</p>
          <ul className="ij-mini-list">
            {entry.techniques.map((tech) => (
              <li key={tech.name}>
                <span>{tech.name}</span>
                <label className="ij-check">
                  <input
                    type="checkbox"
                    checked={tech.shareWithStudents === true}
                    onChange={(event) => onToggleTech(tech.name, event.target.checked)}
                  />
                  <span>Share with students</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ij-block" data-testid={`ij-entry-videos-${entry.id}`}>
        <p className="ij-sublabel">Class videos</p>
        {entry.videos && entry.videos.length > 0 ? (
          <ul className="ij-mini-list">
            {entry.videos.map((video) => (
              <li key={video.href}>
                <a href={video.href} target="_blank" rel="noreferrer">
                  {video.title}
                </a>
                <label className="ij-check">
                  <input
                    type="checkbox"
                    checked={video.shareWithStudents === true}
                    onChange={(event) => onToggleVideoShare(video.href, event.target.checked)}
                  />
                  <span>Share with students</span>
                </label>
                <button type="button" className="ij-link-btn" onClick={() => onRemoveVideo(video.href)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ip-quiet">No videos on this class yet.</p>
        )}
        <form className="ij-video-inline" onSubmit={submitVideo}>
          <input
            type="text"
            aria-label="Class video title"
            placeholder="Video title"
            value={videoTitle}
            onChange={(event) => setVideoTitle(event.target.value)}
          />
          <input
            type="text"
            aria-label="Class video link"
            placeholder="https://"
            value={videoHref}
            onChange={(event) => setVideoHref(event.target.value)}
          />
          <label className="ij-check">
            <input
              type="checkbox"
              checked={videoShare}
              onChange={(event) => setVideoShare(event.target.checked)}
            />
            <span>Share</span>
          </label>
          <button type="submit" className="ij-btn-secondary">
            Add video
          </button>
        </form>
        {videoError ? (
          <p className="ij-error" role="alert">
            {videoError}
          </p>
        ) : null}
      </div>

      <div className="ij-share-preview" data-testid="journal-share-preview" aria-label="What students would receive">
        <p className="ij-sublabel">What students would receive (preview only)</p>
        {hasShareable ? (
          <div className="ij-share-preview__body">
            {bundle.notes ? <p>{bundle.notes}</p> : null}
            {bundle.techniques.length > 0 ? <p>{`Techniques: ${bundle.techniques.join(', ')}`}</p> : null}
            {bundle.videos.length > 0 ? (
              <p>{`Videos: ${bundle.videos.map((v) => v.title).join(', ')}`}</p>
            ) : null}
          </div>
        ) : (
          <p className="ip-quiet">Nothing marked “Share with students” yet. Private notes and goals stay out.</p>
        )}
        <p className="ip-quiet">{`Private items excluded: ${bundle.excludedPrivateCount}`}</p>
        <InstructorClassRoster
          date={entry.date}
          slot={entry.slotId ? { slotId: entry.slotId, date: entry.date, time: '', title: entry.classLabel || 'Class', location: '', subtitle: '', kind: 'class', label: entry.classLabel || 'Class' } : null}
          slots={entry.slotId ? [{ slotId: entry.slotId, date: entry.date, time: '', title: entry.classLabel || 'Class', location: '', subtitle: '', kind: 'class', label: entry.classLabel || 'Class' }] : []}
          onPickSlot={() => {}}
          roster={roster}
          cards={cards}
          entry={entry}
          onPrefillWho={() => {}}
          sandbox={sandbox}
        />
      </div>
    </li>
  );
}
