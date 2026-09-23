import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LessonMediaRail } from '../components/LessonMediaRail';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { NOTES_LEAD, TRAINING_NOTES_LABEL } from '../lib/coachCopy';
import {
  lessonSlotOffersVideo,
  matchLessonTree,
  parallelVideoSlot,
  techniqueTreeLaunchPath,
  techniquesLaunchPath,
  type LessonSlotRef,
  type LessonTreeCandidate,
} from '../lib/lessonLinks';
import { loadTechniqueBoard } from '../lib/techniqueStore';
import type { VideoPlan } from '../lib/techniqueLogic';
import { loadTechniqueArchive, type TechniqueTreeArchive } from '../lib/techniqueTreeStore';
import {
  CLOSING_MAX,
  COACH_NAME_MAX,
  COOLDOWN_NOTE_MAX,
  EXPECTED_MAX,
  INTRO_MAX,
  MAX_TECHNIQUES,
  MIN_TECHNIQUES,
  SPECIFIC_NOTE_MAX,
  TECHNIQUE_NOTES_MAX,
  TECHNIQUE_TITLE_MAX,
  WARMUP_NOTE_MAX,
  addTechnique,
  copyPlan,
  emptyPlan,
  loadTrainingArchive,
  localDateKey,
  planDayStamp,
  planDayTitle,
  planHasContent,
  recentDateKeys,
  removeTechnique,
  saveDay,
  shiftDateKey,
  type TechniqueBlock,
  type TrainingNotesArchive,
  type TrainingNotesPlan,
} from '../lib/trainingNotesStore';

type TodayVideos = {
  plan: VideoPlan;
  urls: Record<string, string>;
};

function videoOffer(
  videos: TodayVideos | null,
  ref: LessonSlotRef,
): { show: boolean; slotId: string | null; clipUrl?: string } {
  const count = videos ? videos.plan.slots.filter((slot) => slot.kind === 'technique').length : null;
  const show = lessonSlotOffersVideo(ref, count);
  if (!videos) return { show, slotId: null };
  const slot = parallelVideoSlot(videos.plan, ref);
  if (!slot) return { show, slotId: null };
  return {
    show,
    slotId: slot.slotId,
    clipUrl: slot.clipId ? videos.urls[slot.clipId] : undefined,
  };
}

export function TrainingNotesPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  useCoachPageSwipe();
  const [boot] = useState(() => {
    const today = localDateKey();
    const archive = loadTrainingArchive(today);
    return { today, archive, plan: archive.days[today] ?? emptyPlan() };
  });
  const [todayKey, setTodayKey] = useState(boot.today);
  const [archive, setArchive] = useState<TrainingNotesArchive>(boot.archive);
  const [viewKey, setViewKey] = useState(boot.today);
  const [plan, setPlan] = useState<TrainingNotesPlan>(boot.plan);
  const [recentOpen, setRecentOpen] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [videos, setVideos] = useState<TodayVideos | null>(null);
  const [treeArchive, setTreeArchive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());

  useEffect(() => {
    const roll = () => {
      const next = localDateKey();
      setTodayKey((current) => {
        if (current === next) return current;
        const loaded = loadTrainingArchive(next);
        setArchive(loaded);
        setViewKey(next);
        setPlan(loaded.days[next] ?? emptyPlan());
        setConfirmKey(null);
        setRecentOpen(false);
        return next;
      });
    };
    document.addEventListener('visibilitychange', roll);
    const id = window.setInterval(roll, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', roll);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: string[] = [];
    const load = () => {
      setTreeArchive(loadTechniqueArchive());
      void loadTechniqueBoard()
        .then((board) => {
          const next: Record<string, string> = {};
          const fresh: string[] = [];
          for (const clip of board.clips) {
            const url = URL.createObjectURL(clip.blob);
            fresh.push(url);
            next[clip.id] = url;
          }
          if (cancelled) {
            fresh.forEach((url) => URL.revokeObjectURL(url));
            return;
          }
          created.forEach((url) => URL.revokeObjectURL(url));
          created = fresh;
          setVideos({ plan: board.plan, urls: next });
        })
        .catch(() => {
          if (!cancelled) setVideos(null);
        });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [todayKey]);

  const treeCandidates = useMemo<LessonTreeCandidate[]>(
    () =>
      treeArchive.trees.map((tree) => ({
        id: tree.id,
        name: tree.name,
        rootTitle: tree.root?.title ?? '',
      })),
    [treeArchive],
  );
  const treeChoices = useMemo(
    () =>
      treeCandidates
        .filter((tree) => tree.rootTitle.trim())
        .map((tree) => ({
          id: tree.id,
          name: tree.name,
          detail: tree.rootTitle.trim() !== tree.name ? tree.rootTitle.trim() : '',
        })),
    [treeCandidates],
  );

  const editingToday = viewKey === todayKey;
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const recent = recentDateKeys(archive, todayKey);
  const sourceKey = editingToday ? yesterdayKey : viewKey;
  const sourcePlan = archive.days[sourceKey];
  const canCopy = Boolean(sourcePlan && planHasContent(sourcePlan) && sourceKey !== todayKey);

  const commit = (next: TrainingNotesPlan) => {
    if (!editingToday) return;
    const saved = saveDay(todayKey, next, todayKey);
    setArchive(saved.archive);
    setPlan(saved.plan);
  };

  const openDay = (key: string) => {
    setViewKey(key);
    setConfirmKey(null);
    setRecentOpen(false);
    setPlan(archive.days[key] ?? emptyPlan());
  };

  const applyCopy = (key: string) => {
    const source = archive.days[key];
    if (!source || !planHasContent(source)) return;
    const saved = saveDay(todayKey, copyPlan(source), todayKey);
    setArchive(saved.archive);
    setPlan(saved.plan);
    setViewKey(todayKey);
    setConfirmKey(null);
    setRecentOpen(false);
  };

  const requestCopy = () => {
    if (!canCopy) return;
    const todayPlan = editingToday ? plan : (archive.days[todayKey] ?? emptyPlan());
    if (planHasContent(todayPlan)) {
      setConfirmKey(sourceKey);
      return;
    }
    applyCopy(sourceKey);
  };

  const patchTechnique = (id: string, patch: Partial<TechniqueBlock>) => {
    commit({
      ...plan,
      techniques: plan.techniques.map((tech) => (tech.id === id ? { ...tech, ...patch } : tech)),
    });
  };

  const atMax = plan.techniques.length >= MAX_TECHNIQUES;
  const copyLabel = editingToday ? 'Copy yesterday' : 'Copy into today';

  const openVideo = (ref: LessonSlotRef) => {
    const offer = videoOffer(videos, ref);
    if (!offer.slotId || !offer.clipUrl) return;
    navigate(techniquesLaunchPath(offer.slotId));
  };

  const sectionMedia = (ref: LessonSlotRef, label: string, tech?: TechniqueBlock) => {
    const offer = videoOffer(videos, ref);
    const linked = tech ? matchLessonTree(tech.title, tech.treeId, treeCandidates) : null;
    return (
      <LessonMediaRail
        showVideo={editingToday && offer.show}
        videoLabel={label}
        clipUrl={offer.clipUrl}
        onPlay={() => openVideo(ref)}
        linkedTree={linked ? { id: linked.id, name: linked.name } : null}
        treeChoices={tech ? treeChoices : []}
        canEditTree={Boolean(tech) && editingToday}
        storedTreeId={tech?.treeId}
        onOpenTree={tech ? (treeId) => navigate(techniqueTreeLaunchPath(treeId)) : undefined}
        onPickTree={
          tech
            ? (treeId) => patchTechnique(tech.id, treeId ? { treeId } : { treeId: undefined })
            : undefined
        }
      />
    );
  };

  return (
    <main className="notes">
      <PlayExitMark
        to={parent.path}
        onExit={() => {
          navigate(parent.path);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{parent.eyebrow}</p>
          <h1>{TRAINING_NOTES_LABEL}</h1>
        </div>
      </header>
      <p className="notes__lead">{NOTES_LEAD}</p>

      <div className="notes__plan">
        <section className="notes__archive" aria-label="Saved days">
          <div className="notes__days">
            <button
              type="button"
              className={viewKey === todayKey ? 'notes__day notes__day--on' : 'notes__day'}
              aria-pressed={viewKey === todayKey}
              onClick={() => openDay(todayKey)}
            >
              Today
            </button>
            <button
              type="button"
              className={viewKey === yesterdayKey ? 'notes__day notes__day--on' : 'notes__day'}
              aria-pressed={viewKey === yesterdayKey}
              onClick={() => openDay(yesterdayKey)}
            >
              Yesterday
            </button>
            <button
              type="button"
              className={recentOpen ? 'notes__day notes__day--on' : 'notes__day'}
              aria-expanded={recentOpen}
              onClick={() => {
                setConfirmKey(null);
                setRecentOpen((open) => !open);
              }}
            >
              Recent
            </button>
          </div>
          <p className="notes__when">
            {planDayTitle(viewKey, todayKey)} · {planDayStamp(viewKey)}
            {editingToday ? '' : ' · View only'}
          </p>
          {recentOpen ? (
            recent.length ? (
              <ul className="notes__recent">
                {recent.map((key) => {
                  const title = planDayTitle(key, todayKey);
                  const stamp = planDayStamp(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={key === viewKey ? 'notes__recent-btn notes__recent-btn--on' : 'notes__recent-btn'}
                        onClick={() => openDay(key)}
                      >
                        <span>{title}</span>
                        {title === stamp ? null : <span>{stamp}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="notes__recent-empty">No saved days yet.</p>
            )
          ) : null}
          {canCopy && confirmKey ? (
            <div className="notes__confirm" role="group" aria-label="Replace today's plan">
              <p>Replace today's plan with {planDayTitle(confirmKey, todayKey)}?</p>
              <div className="notes__confirm-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmKey(null)}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={() => applyCopy(confirmKey)}>
                  Copy into today
                </button>
              </div>
            </div>
          ) : null}
          {canCopy && !confirmKey ? (
            <button type="button" className="btn notes__copy" onClick={requestCopy}>
              {copyLabel}
            </button>
          ) : null}
          {!editingToday && !planHasContent(plan) ? (
            <p className="notes__recent-empty">No plan saved for this day.</p>
          ) : null}
        </section>

        <section className="notes__card">
          <label className="notes__field" htmlFor="notes-coach">
            Coach name
            <input
              id="notes-coach"
              value={plan.coachName}
              maxLength={COACH_NAME_MAX}
              autoComplete="off"
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, coachName: event.target.value })}
            />
          </label>
          <div className="notes__field">
            <div className="notes__field-bar">
              <label htmlFor="notes-intro">Intro</label>
              <ExpectedTime
                id="notes-intro-time"
                value={plan.introExpected}
                readOnly={!editingToday}
                onChange={(introExpected) => commit({ ...plan, introExpected })}
              />
            </div>
            <textarea
              id="notes-intro"
              value={plan.intro}
              rows={4}
              maxLength={INTRO_MAX}
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, intro: event.target.value })}
            />
          </div>
        </section>

        <NoteSection
          id="notes-warmup"
          title="Warm-up"
          label="Special note"
          value={plan.warmupNote}
          expected={plan.warmupExpected}
          maxLength={WARMUP_NOTE_MAX}
          readOnly={!editingToday}
          onChange={(warmupNote) => commit({ ...plan, warmupNote })}
          onExpected={(warmupExpected) => commit({ ...plan, warmupExpected })}
          media={sectionMedia({ role: 'warmup' }, 'Warm-up')}
        />

        {plan.techniques.map((tech, index) => (
          <TechniqueBlockView
            key={tech.id}
            index={index}
            tech={tech}
            readOnly={!editingToday}
            canRemove={editingToday && index >= MIN_TECHNIQUES}
            onChange={(patch) => patchTechnique(tech.id, patch)}
            onRemove={() => commit(removeTechnique(plan, tech.id))}
            media={sectionMedia({ role: 'technique', index }, `Technique / Drill ${index + 1}`, tech)}
          />
        ))}

        {editingToday ? (
          <button
            type="button"
            className="btn notes__add"
            disabled={atMax}
            onClick={() => commit(addTechnique(plan))}
          >
            + Add another
          </button>
        ) : null}

        <NoteSection
          id="notes-specific"
          title="Specific Training / Rounds"
          label="Special note"
          value={plan.specificNote}
          expected={plan.specificExpected}
          maxLength={SPECIFIC_NOTE_MAX}
          readOnly={!editingToday}
          onChange={(specificNote) => commit({ ...plan, specificNote })}
          onExpected={(specificExpected) => commit({ ...plan, specificExpected })}
        />

        <NoteSection
          id="notes-cooldown"
          title="Cool down"
          label="Special note"
          value={plan.cooldownNote}
          expected={plan.cooldownExpected}
          maxLength={COOLDOWN_NOTE_MAX}
          readOnly={!editingToday}
          onChange={(cooldownNote) => commit({ ...plan, cooldownNote })}
          onExpected={(cooldownExpected) => commit({ ...plan, cooldownExpected })}
          media={sectionMedia({ role: 'cooldown' }, 'Cool down')}
        />

        <section className="notes__card">
          <label className="notes__field" htmlFor="notes-closing">
            Closing
            <textarea
              id="notes-closing"
              value={plan.closing}
              rows={4}
              maxLength={CLOSING_MAX}
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, closing: event.target.value })}
            />
          </label>
        </section>
      </div>
    </main>
  );
}

function ExpectedTime({
  id,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="notes__time" htmlFor={id}>
      Expected Duration
      <input
        id={id}
        value={value}
        maxLength={EXPECTED_MAX}
        readOnly={readOnly}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NoteSection({
  id,
  title,
  label,
  value,
  expected,
  maxLength,
  readOnly,
  onChange,
  onExpected,
  media,
}: {
  id: string;
  title: string;
  label: string;
  value: string;
  expected: string;
  maxLength: number;
  readOnly: boolean;
  onChange: (value: string) => void;
  onExpected: (value: string) => void;
  media?: ReactNode;
}) {
  return (
    <section className="notes__card" aria-labelledby={`${id}-title`}>
      <div className="notes__section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        {media ? <div className="notes__section-side">{media}</div> : null}
      </div>
      <div className="notes__field-bar">
        <label className="notes__kicker" htmlFor={id}>
          {label}
        </label>
        <ExpectedTime
          id={`${id}-time`}
          value={expected}
          readOnly={readOnly}
          onChange={onExpected}
        />
      </div>
      <textarea
        id={id}
        className="notes__area"
        value={value}
        rows={3}
        maxLength={maxLength}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}

function TechniqueBlockView({
  index,
  tech,
  readOnly,
  canRemove,
  onChange,
  onRemove,
  media,
}: {
  index: number;
  tech: TechniqueBlock;
  readOnly: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<TechniqueBlock>) => void;
  onRemove: () => void;
  media?: ReactNode;
}) {
  const number = index + 1;
  const titleId = `notes-tech-${tech.id}`;
  const notesId = `notes-tech-notes-${tech.id}`;
  return (
    <div className="notes__block">
      <section className="notes__card" aria-labelledby={`notes-tech-heading-${tech.id}`}>
        <div className="notes__section-head">
          <h2 id={`notes-tech-heading-${tech.id}`}>Technique / Drill {number}</h2>
          <div className="notes__section-side">
            {canRemove ? (
              <button type="button" className="btn btn--ghost notes__remove" onClick={onRemove}>
                Remove
              </button>
            ) : null}
            {media}
          </div>
        </div>
        <label className="notes__field" htmlFor={titleId}>
          Title
          <input
            id={titleId}
            value={tech.title}
            maxLength={TECHNIQUE_TITLE_MAX}
            readOnly={readOnly}
            autoComplete="off"
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <div className="notes__field">
          <div className="notes__field-bar">
            <label htmlFor={notesId}>Notes</label>
            <ExpectedTime
              id={`notes-tech-time-${tech.id}`}
              value={tech.expected}
              readOnly={readOnly}
              onChange={(expected) => onChange({ expected })}
            />
          </div>
          <textarea
            id={notesId}
            value={tech.notes}
            rows={4}
            maxLength={TECHNIQUE_NOTES_MAX}
            readOnly={readOnly}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        </div>
      </section>
      <button
        type="button"
        className={tech.waterBreak ? 'notes__break notes__break--on' : 'notes__break'}
        role="switch"
        aria-checked={tech.waterBreak}
        aria-label={`Water break after Technique / Drill ${number}`}
        disabled={readOnly}
        onClick={() => onChange({ waterBreak: !tech.waterBreak })}
      >
        <span className="notes__switch" aria-hidden="true" />
        <span className="notes__break-copy">
          <span className="notes__break-label">Water break</span>
          {tech.waterBreak ? <span className="notes__break-hint">Before the next section</span> : null}
        </span>
        <span className="notes__break-state">{tech.waterBreak ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
