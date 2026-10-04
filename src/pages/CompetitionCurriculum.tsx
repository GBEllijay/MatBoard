import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { LessonMediaRail } from '../components/LessonMediaRail';
import { OpenMyDrive } from '../components/OpenMyDrive';
import { PlayExitMark } from '../components/PlayExitMark';
import { SeatSessionBar } from '../components/SeatSessionBar';
import { Sheet } from '../components/Sheet';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { COACH_LESSON_EYEBROW } from '../lib/coachCopy';
import {
  CURRICULUM_ADD_EXAMPLES,
  CURRICULUM_ADD_LABEL,
  CURRICULUM_DEVICE_NOTE,
  CURRICULUM_LABEL,
  CURRICULUM_LOCK_LABEL,
  CURRICULUM_PATH,
  CURRICULUM_SAVE_LEAD,
  CURRICULUM_SAVE_LINK,
  CURRICULUM_UNLOCK_LABEL,
  DESIGNATION_PLACEHOLDER,
  EXPECTED_PLACEHOLDER,
  MAX_BLOCKS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  appendBlock,
  blockHeading,
  blockNotesLabel,
  blockOffersClock,
  blockOffersExpected,
  blockOffersNotes,
  blockOffersTree,
  copyCurriculum,
  curriculumBrowseFolders,
  curriculumHasContent,
  curriculumListLabel,
  curriculumRowLabel,
  emptyCurriculum,
  expectedToWorkMs,
  findCurriculumById,
  insertBlockAfter,
  loadCurriculumArchive,
  moveBlock,
  normalizeExpectedDuration,
  plansOnCurriculumDay,
  removeBlock,
  removeCurriculumPlan,
  saveCurriculum,
  type CurriculumBlock,
  type CurriculumPlan,
} from '../lib/competitionCurriculum';
import { exportCurriculumToDrive } from '../lib/curriculumDrive';
import { techniquesPathForCurriculum } from '../lib/curriculumVideos';
import { deleteUnusedTrainingClip, readTrainingClipBlob } from '../lib/techniqueStore';
import { CONNECT_WITH_TITLE } from '../lib/cloudStorage';
import { CLASS_DESIGNATION_MAX, CLASS_TIME_MAX, CLOSING_MAX, COACH_NAME_MAX, EXPECTED_MAX, TECHNIQUE_NOTES_MAX, TECHNIQUE_TITLE_MAX, localDateKey, planDayStamp, planDayTitle, shiftDateKey } from '../lib/trainingNotesStore';
import { techniqueTreeLaunchPath } from '../lib/lessonLinks';
import { COACHING_TOOLS_PATH, UNLIMITED_LESSON_VALUE } from '../lib/productNames';
import { loadTechniqueArchive, type TechniqueTreeArchive } from '../lib/techniqueTreeStore';
import { resetTrainingSession, setRounds, setWorkMs } from '../lib/trainingStore';
import { trainingPathWithReturn } from '../lib/timerReturn';

export function CompetitionCurriculumPage() {
  const navigate = useNavigate();
  const proUnlocked = useProUnlocked();
  const [searchParams] = useSearchParams();
  const unlimitedPlan = proUnlocked && searchParams.get('plan') === UNLIMITED_LESSON_VALUE;
  const parentPath = unlimitedPlan
    ? `${COACHING_TOOLS_PATH}?plan=${UNLIMITED_LESSON_VALUE}`
    : COACHING_TOOLS_PATH;
  const returnPath = unlimitedPlan ? `${CURRICULUM_PATH}?plan=${UNLIMITED_LESSON_VALUE}` : CURRICULUM_PATH;
  const [boot] = useState(() => {
    const todayKey = localDateKey();
    const archive = loadCurriculumArchive(todayKey);
    return { todayKey, archive, plan: plansOnCurriculumDay(archive, todayKey)[0] ?? emptyCurriculum() };
  });
  const [todayKey, setTodayKey] = useState(boot.todayKey);
  const [archive, setArchive] = useState(boot.archive);
  const [viewKey, setViewKey] = useState(boot.todayKey);
  const [plan, setPlan] = useState<CurriculumPlan>(boot.plan);
  const [classesOpen, setClassesOpen] = useState(false);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [treeArchive, setTreeArchive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [driveNote, setDriveNote] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const planRef = useRef(plan);
  const viewKeyRef = useRef(viewKey);
  const todayKeyRef = useRef(todayKey);
  planRef.current = plan;
  viewKeyRef.current = viewKey;
  todayKeyRef.current = todayKey;

  useEffect(() => {
    const roll = () => {
      const next = localDateKey();
      setTodayKey((current) => {
        if (current === next) return current;
        const loaded = loadCurriculumArchive(next);
        setArchive(loaded);
        setViewKey(next);
        setPlan(plansOnCurriculumDay(loaded, next)[0] ?? emptyCurriculum());
        setClassesOpen(false);
        setFolderKey(null);
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
    const load = () => setTreeArchive(loadTechniqueArchive());
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const clipKey = plan.blocks.map((block) => block.clipId ?? '').join('|');
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const ids = clipKey.split('|').filter(Boolean);
    void Promise.all(
      ids.map(async (id) => {
        const blob = await readTrainingClipBlob(id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [id, url] as const;
      }),
    )
      .then((rows) => {
        if (cancelled) {
          created.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        const next: Record<string, string> = {};
        for (const row of rows) {
          if (row) next[row[0]] = row[1];
        }
        setClipUrls(next);
      })
      .catch(() => {
        if (!cancelled) setClipUrls({});
      });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [clipKey]);

  const treeCandidates = useMemo(
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
  const showStructure = editingToday && !plan.locked;
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const classFolders = useMemo(() => curriculumBrowseFolders(archive, todayKey), [archive, todayKey]);
  const openFolder = folderKey !== null ? (classFolders.find((folder) => folder.key === folderKey) ?? null) : null;
  const savedPlans = plansOnCurriculumDay(archive, viewKey);
  const currentSaved = savedPlans.some((item) => item.id === plan.id);
  const classPlans =
    currentSaved || !editingToday ? savedPlans : savedPlans.length === 0 ? [plan] : [...savedPlans, plan];
  const yesterdayPlans = plansOnCurriculumDay(archive, yesterdayKey).filter(curriculumHasContent);
  const copyTargets = editingToday ? yesterdayPlans : curriculumHasContent(plan) ? [plan] : [];
  const todayHasContent =
    plansOnCurriculumDay(archive, todayKey).some(curriculumHasContent) || (editingToday && curriculumHasContent(plan));
  const confirmPlan = confirmPlanId ? findCurriculumById(archive, confirmPlanId) : null;
  const [saveBefore, saveAfter] = CURRICULUM_SAVE_LEAD.split(CURRICULUM_SAVE_LINK);

  const commit = (next: CurriculumPlan) => {
    if (viewKeyRef.current !== todayKeyRef.current) return;
    const saved = saveCurriculum(todayKeyRef.current, next, todayKeyRef.current);
    setArchive(saved.archive);
    setPlan(saved.plan);
  };

  const patchBlock = (id: string, patch: Partial<CurriculumBlock>) => {
    const current = planRef.current;
    commit({
      ...current,
      blocks: current.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    });
  };

  const openDay = (key: string) => {
    setViewKey(key);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
    setPlan(plansOnCurriculumDay(archive, key)[0] ?? emptyCurriculum());
  };

  const openSavedPlan = (dateKey: string, next: CurriculumPlan) => {
    setViewKey(dateKey);
    setPlan(next);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
  };

  const applyCopy = (source: CurriculumPlan) => {
    if (!curriculumHasContent(source)) return;
    const saved = saveCurriculum(todayKey, copyCurriculum(source), todayKey);
    setArchive(saved.archive);
    setPlan(saved.plan);
    setViewKey(todayKey);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
  };

  const requestCopy = (source: CurriculumPlan) => {
    if (!curriculumHasContent(source)) return;
    if (todayHasContent) {
      setConfirmPlanId(source.id);
      setRemoveArmed(false);
      return;
    }
    applyCopy(source);
  };

  const addClassPlan = () => {
    if (!editingToday || !curriculumHasContent(plan)) return;
    setPlan(emptyCurriculum());
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setViewKey(todayKey);
  };

  const removeClassPlan = () => {
    if (!editingToday) return;
    const nextArchive = removeCurriculumPlan(todayKey, plan.id, todayKey);
    setArchive(nextArchive);
    const remaining = plansOnCurriculumDay(nextArchive, todayKey);
    setPlan(remaining[0] ?? emptyCurriculum());
    setRemoveArmed(false);
    setConfirmPlanId(null);
  };

  const openTimer = (block: CurriculumBlock) => {
    if (block.kind === 'live') setRounds(block.rounds, false);
    else setWorkMs(expectedToWorkMs(block.expected));
    resetTrainingSession();
    navigate(trainingPathWithReturn(returnPath));
  };

  const saveDriveCopy = async () => {
    setDriveNote('');
    const result = await exportCurriculumToDrive({ dateKey: todayKey, plan: planRef.current });
    if (result.status === 'needs-drive') {
      setConnectOpen(true);
      setDriveNote('Connect your Drive, then click here again. This curriculum stays on this phone.');
      return;
    }
    if (result.status === 'saved') {
      setDriveNote('A copy is on your connected Drive. Videos stay on this phone.');
      return;
    }
    if (result.status === 'empty') {
      setDriveNote('Add something to today first. An empty curriculum stays on this phone.');
      return;
    }
    setDriveNote('Saved on this phone. Your Drive could not take this curriculum.');
  };

  const linkedTree = (block: CurriculumBlock) => {
    if (!block.treeId) return null;
    const found = treeCandidates.find((tree) => tree.id === block.treeId);
    return found ? { id: found.id, name: found.name } : null;
  };

  return (
    <main className="notes">
      <PlayExitMark
        to={parentPath}
        onExit={() => {
          navigate(parentPath);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{COACH_LESSON_EYEBROW}</p>
          <h1>{CURRICULUM_LABEL}</h1>
        </div>
      </header>
      <SeatSessionBar />
      <div className="notes__plan">
        <OpenMyDrive />
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
              className={classesOpen ? 'notes__day notes__day--on' : 'notes__day'}
              aria-expanded={classesOpen}
              onClick={() => {
                setConfirmPlanId(null);
                setRemoveArmed(false);
                setClassesOpen((open) => {
                  setFolderKey(null);
                  return !open;
                });
              }}
            >
              Classes
            </button>
          </div>
          <p className="notes__when">
            {planDayTitle(viewKey, todayKey)} · {planDayStamp(viewKey)}
            {editingToday ? '' : ' · View only'}
          </p>
          <p className="notes__when">{CURRICULUM_DEVICE_NOTE}</p>
          {classesOpen ? (
            openFolder ? (
              <div className="notes__folders" aria-label={`${openFolder.label} dates`}>
                <button type="button" className="btn btn--ghost notes__folder-back" onClick={() => setFolderKey(null)}>
                  All classes
                </button>
                <p className="notes__folder-title">{openFolder.label}</p>
                <ul className="notes__recent">
                  {openFolder.dates.map((day) => {
                    const title = planDayTitle(day.dateKey, todayKey);
                    const stamp = planDayStamp(day.dateKey);
                    return (
                      <li key={day.dateKey} className="notes__folder-day">
                        <p className="notes__folder-date">
                          {title}
                          {title === stamp ? '' : ` · ${stamp}`}
                        </p>
                        <ul className="notes__recent">
                          {day.plans.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                className={
                                  viewKey === day.dateKey && plan.id === item.id
                                    ? 'notes__recent-btn notes__recent-btn--on'
                                    : 'notes__recent-btn'
                                }
                                onClick={() => openSavedPlan(day.dateKey, item)}
                              >
                                {curriculumRowLabel(item)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : classFolders.length ? (
              <ul className="notes__recent" aria-label="Class folders">
                {classFolders.map((folder) => (
                  <li key={folder.key || 'unlabeled'}>
                    <button type="button" className="notes__recent-btn" onClick={() => setFolderKey(folder.key)}>
                      <span>{folder.label}</span>
                      <span>{folder.dates.length === 1 ? '1 day' : `${folder.dates.length} days`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notes__recent-empty">No saved curriculums yet.</p>
            )
          ) : null}
          {confirmPlan ? (
            <div className="notes__confirm" role="group" aria-label="Add curriculum to today">
              <p>Add {curriculumListLabel(confirmPlan)} to today? Today's other curriculums stay.</p>
              <div className="notes__confirm-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmPlanId(null)}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={() => applyCopy(confirmPlan)}>
                  Add to today
                </button>
              </div>
            </div>
          ) : null}
          {copyTargets.length && !confirmPlanId
            ? copyTargets.map((source) => (
                <button key={source.id} type="button" className="btn notes__copy" onClick={() => requestCopy(source)}>
                  {copyTargets.length === 1 ? (editingToday ? 'Copy yesterday' : 'Copy into today') : `Copy ${curriculumListLabel(source)}`}
                </button>
              ))
            : null}
          {!editingToday && !curriculumHasContent(plan) ? (
            <p className="notes__recent-empty">No curriculum saved for this day.</p>
          ) : null}
        </section>

        {classPlans.length > 1 || (editingToday && curriculumHasContent(plan)) ? (
          <section className="notes__classes" aria-label="Curriculums">
            {classPlans.length > 1 ? (
              <ul className="notes__class-list">
                {classPlans.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.id === plan.id ? 'notes__class-btn notes__class-btn--on' : 'notes__class-btn'}
                      aria-pressed={item.id === plan.id}
                      onClick={() => {
                        setPlan(item);
                        setConfirmPlanId(null);
                        setRemoveArmed(false);
                      }}
                    >
                      {curriculumListLabel(item)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {editingToday ? (
              <div className="notes__class-actions">
                <button type="button" className="btn notes__add" disabled={!curriculumHasContent(plan)} onClick={addClassPlan}>
                  Add class plan
                </button>
                {curriculumHasContent(plan) && removeArmed ? (
                  <div className="notes__confirm" role="group" aria-label="Remove this curriculum">
                    <p>Remove {curriculumListLabel(plan)}?</p>
                    <div className="notes__confirm-actions">
                      <button type="button" className="btn btn--ghost" onClick={() => setRemoveArmed(false)}>
                        Cancel
                      </button>
                      <button type="button" className="btn" onClick={removeClassPlan}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
                {curriculumHasContent(plan) && !removeArmed ? (
                  <button type="button" className="btn btn--ghost notes__copy" onClick={() => setRemoveArmed(true)}>
                    Remove this class plan
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="notes__card">
          <label className="notes__field" htmlFor="curriculum-coach">
            Coach name
            <input
              id="curriculum-coach"
              value={plan.coachName}
              maxLength={COACH_NAME_MAX}
              autoComplete="off"
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, coachName: event.target.value })}
            />
          </label>
          <label className="notes__field" htmlFor="curriculum-designation">
            Competition Class Designation
            <input
              id="curriculum-designation"
              value={plan.classDesignation}
              maxLength={CLASS_DESIGNATION_MAX}
              placeholder={DESIGNATION_PLACEHOLDER}
              autoComplete="off"
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, classDesignation: event.target.value })}
            />
          </label>
          <label className="notes__field" htmlFor="curriculum-time">
            Class time
            <input
              id="curriculum-time"
              value={plan.classTime}
              maxLength={CLASS_TIME_MAX}
              placeholder="5:00 PM"
              autoComplete="off"
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, classTime: event.target.value })}
            />
          </label>
        </section>

        {plan.blocks.map((block, index) => (
          <CurriculumCard
            key={block.id}
            block={block}
            index={index}
            count={plan.blocks.length}
            readOnly={!editingToday}
            showStructure={showStructure}
            clipUrl={block.clipId ? clipUrls[block.clipId] : undefined}
            atMax={plan.blocks.length >= MAX_BLOCKS}
            tree={
              blockOffersTree(block.kind) ? (
                <LessonMediaRail
                  showVideo={false}
                  videoLabel={blockHeading(block)}
                  onPlay={() => undefined}
                  linkedTree={linkedTree(block)}
                  treeChoices={treeChoices}
                  canEditTree={editingToday}
                  storedTreeId={block.treeId}
                  onOpenTree={(treeId) => navigate(techniqueTreeLaunchPath(treeId))}
                  onPickTree={(treeId) => patchBlock(block.id, treeId ? { treeId } : { treeId: undefined })}
                />
              ) : null
            }
            onChange={(patch) => patchBlock(block.id, patch)}
            onRemove={() => {
              if (block.clipId) void deleteUnusedTrainingClip(block.clipId);
              commit(removeBlock(planRef.current, block.id));
            }}
            onMove={(direction) => commit(moveBlock(planRef.current, block.id, direction))}
            onAdd={() => commit(insertBlockAfter(planRef.current, block.id))}
            onOpenTimer={() => openTimer(block)}
            onOpenVideo={() => navigate(techniquesPathForCurriculum(block.id, returnPath))}
          />
        ))}

        {showStructure && plan.blocks.length === 0 ? (
          <button
            type="button"
            className="btn notes__add curriculum__add"
            data-add-another=""
            onClick={() => commit(appendBlock(plan))}
          >
            <span>{CURRICULUM_ADD_LABEL}</span>
            <small>{CURRICULUM_ADD_EXAMPLES}</small>
          </button>
        ) : null}

        <section className="notes__card">
          <label className="notes__field" htmlFor="curriculum-closing">
            Closing
            <textarea
              id="curriculum-closing"
              value={plan.closing}
              rows={4}
              maxLength={CLOSING_MAX}
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, closing: event.target.value })}
            />
          </label>
        </section>

        {editingToday ? (
          <button
            type="button"
            className="btn notes__add"
            data-lock-curriculum=""
            aria-pressed={plan.locked}
            onClick={() => commit({ ...plan, locked: !plan.locked })}
          >
            {plan.locked ? CURRICULUM_UNLOCK_LABEL : CURRICULUM_LOCK_LABEL}
          </button>
        ) : null}

        {editingToday ? (
          <aside className="notes__distribute" aria-label="Your Drive copy">
            <p>
              {saveBefore}
              <button type="button" className="home__text-btn" onClick={() => void saveDriveCopy()}>
                {CURRICULUM_SAVE_LINK}
              </button>
              {saveAfter}
            </p>
            {driveNote ? (
              <p className="notes__distribute-note" role="status">
                {driveNote}
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>

      <Sheet open={connectOpen} title={CONNECT_WITH_TITLE} onClose={() => setConnectOpen(false)} stacked>
        <p className="saver-sound-hint">
          Sign in, then pick the gym folder. This curriculum text can be saved there. Videos stay on this phone.
        </p>
        <DriveConnectCard />
      </Sheet>
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
        placeholder={EXPECTED_PLACEHOLDER}
        readOnly={readOnly}
        autoComplete="off"
        inputMode="text"
        enterKeyHint="done"
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(normalizeExpectedDuration(event.currentTarget.value))}
      />
    </label>
  );
}

function CurriculumCard({
  block,
  index,
  count,
  readOnly,
  showStructure,
  clipUrl,
  atMax,
  tree,
  onChange,
  onRemove,
  onMove,
  onAdd,
  onOpenTimer,
  onOpenVideo,
}: {
  block: CurriculumBlock;
  index: number;
  count: number;
  readOnly: boolean;
  showStructure: boolean;
  clipUrl?: string;
  atMax: boolean;
  tree: ReactNode;
  onChange: (patch: Partial<CurriculumBlock>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onAdd: () => void;
  onOpenTimer: () => void;
  onOpenVideo: () => void;
}) {
  const heading = blockHeading(block);
  const showWater = showStructure || block.waterBreak;
  return (
    <div className="notes__block">
      <section className="notes__card" aria-labelledby={`curriculum-${block.id}-title`}>
        <div className="notes__section-head">
          <h2 id={`curriculum-${block.id}-title`}>{heading}</h2>
          {tree ? <div className="notes__section-side">{tree}</div> : null}
        </div>
        {block.kind === 'custom' ? (
          <label className="notes__field" htmlFor={`curriculum-${block.id}-name`}>
            Title
            <input
              id={`curriculum-${block.id}-name`}
              value={block.title}
              maxLength={TECHNIQUE_TITLE_MAX}
              placeholder={CURRICULUM_ADD_EXAMPLES}
              readOnly={readOnly}
              autoComplete="off"
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </label>
        ) : null}
        {blockOffersClock(block.kind) ? (
          <div className="presets curriculum__modes" role="radiogroup" aria-label={`Timer or video for ${heading}`}>
            <button
              type="button"
              role="radio"
              aria-checked={block.timing === 'timer'}
              className={`preset${block.timing === 'timer' ? ' preset--on' : ''}`}
              disabled={readOnly}
              onClick={() => onChange({ timing: 'timer' })}
            >
              Timer only
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={block.timing === 'video'}
              className={`preset${block.timing === 'video' ? ' preset--on' : ''}`}
              disabled={readOnly}
              onClick={() => onChange({ timing: 'video' })}
            >
              Looping video
            </button>
          </div>
        ) : null}
        {blockOffersClock(block.kind) && block.timing === 'video' ? (
          <LessonMediaRail
            showVideo
            videoLabel={heading}
            clipUrl={clipUrl}
            onPlay={() => {
              if (!clipUrl && readOnly) return;
              onOpenVideo();
            }}
          />
        ) : null}
        {blockOffersExpected(block.kind) ? (
          <ExpectedTime
            id={`curriculum-${block.id}-time`}
            value={block.expected}
            readOnly={readOnly}
            onChange={(expected) => onChange({ expected })}
          />
        ) : null}
        {blockOffersNotes(block.kind) ? (
          <label className="notes__field" htmlFor={`curriculum-${block.id}-notes`}>
            {blockNotesLabel(block.kind)}
            <textarea
              id={`curriculum-${block.id}-notes`}
              value={block.notes}
              rows={3}
              maxLength={TECHNIQUE_NOTES_MAX}
              readOnly={readOnly}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </label>
        ) : null}
        {block.kind === 'live' ? (
          <label className="notes__field" htmlFor={`curriculum-${block.id}-rounds`}>
            Rounds
            <input
              id={`curriculum-${block.id}-rounds`}
              type="number"
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              value={block.rounds}
              readOnly={readOnly}
              onChange={(event) => onChange({ rounds: Number(event.target.value) || MIN_ROUNDS })}
            />
          </label>
        ) : null}
        {block.kind === 'live' || (blockOffersClock(block.kind) && block.timing === 'timer') ? (
          <button type="button" className="btn" onClick={onOpenTimer}>
            Open round timer
          </button>
        ) : null}
      </section>
      {showWater ? (
        <button
          type="button"
          className={block.waterBreak ? 'notes__break notes__break--on' : 'notes__break'}
          role="switch"
          data-water-break=""
          aria-checked={block.waterBreak}
          aria-label={`Water break after ${heading}`}
          disabled={readOnly}
          onClick={() => onChange({ waterBreak: !block.waterBreak })}
        >
          <span className="notes__switch" aria-hidden="true" />
          <span className="notes__break-copy">
            <span className="notes__break-label">Water break</span>
            {block.waterBreak ? <span className="notes__break-hint">Before the next section</span> : null}
          </span>
          <span className="notes__break-state">{block.waterBreak ? 'On' : 'Off'}</span>
        </button>
      ) : null}
      {showStructure ? (
        <div className="curriculum__tools">
          <button type="button" className="btn btn--ghost notes__remove" onClick={onRemove}>
            Remove
          </button>
          <button
            type="button"
            className="btn btn--ghost notes__remove"
            aria-label={`Move ${heading} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            Move up
          </button>
          <button
            type="button"
            className="btn btn--ghost notes__remove"
            aria-label={`Move ${heading} down`}
            disabled={index >= count - 1}
            onClick={() => onMove(1)}
          >
            Move down
          </button>
        </div>
      ) : null}
      {showStructure ? (
        <button
          type="button"
          className="btn notes__add curriculum__add"
          data-add-another=""
          disabled={atMax}
          onClick={onAdd}
        >
          <span>{CURRICULUM_ADD_LABEL}</span>
          <small>{CURRICULUM_ADD_EXAMPLES}</small>
        </button>
      ) : null}
    </div>
  );
}
