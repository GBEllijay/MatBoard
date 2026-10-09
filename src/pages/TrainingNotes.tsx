import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ClassPhotoPromotions } from '../components/ClassPhotoPromotions';
import { PlanDateNav } from '../components/PlanDateNav';
import { CoachPlanExport } from '../components/CoachPlanExport';
import { CollaborationGate, useCurrentSeat } from '../components/SeatSessionBar';
import { LessonMediaRail } from '../components/LessonMediaRail';
import { OpenMyDrive } from '../components/OpenMyDrive';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useToolboxParent } from '../hooks/useToolboxParent';
import {
  COACH_LESSON_EYEBROW,
  NOTES_LEAD,
  TRAINING_NOTES_LABEL,
  UNLIMITED_SHARE_LEAD,
  coachLessonGalleryDownload,
} from '../lib/coachCopy';
import {
  DOWNLOAD_TODAY_LABEL,
  downloadGalleryVideos,
  galleryVideoDownloadName,
  galleryVideosForDay,
  saveBlobDownload,
} from '../lib/galleryDay';
import {
  downloadDriveFile,
  loadTodayDriveVideos,
  requestDriveToken,
  todayDownloadCopy,
  type DriveDayVideo,
  type TodayDriveStatus,
} from '../lib/googleDrive';
import {
  lessonSlotOffersVideo,
  matchLessonTree,
  parallelVideoSlot,
  techniqueTreeLaunchPath,
  techniquesFocusPath,
  type LessonSlotRef,
  type LessonTreeCandidate,
} from '../lib/lessonLinks';
import {
  OPEN_DRIVE_CLASS_LABEL,
  restoreNoticeFromState,
  restoredDayKey,
} from '../lib/lessonRestore';
import { listClassPhotoPromotions } from '../lib/classPhotoPromotions';
import {
  DISTRIBUTE_BUTTON,
  DISTRIBUTE_DONE,
  DISTRIBUTE_LEAD,
  flushLessonDriveDraft,
  getDriveNotice,
  lessonDraftRevisionId,
  markLessonDistribution,
  mediaRefsFromVideoPlan,
  scheduleLessonDriveDraft,
  subscribeDriveNotice,
} from '../lib/lessonDrive';
import { REVIEW_SUBMIT, REVIEW_SUBMITTED, submitForReview } from '../lib/reviewInbox';
import {
  isLiveSeat,
  menuCloudSharing,
  seatMenuAllowed,
  visibleCoachControl,
} from '../lib/instructorSeats';
import { COACH_UNLIMITED_PATH, INSTRUCTOR_COACH_ENTRY, UNLIMITED_LESSON_VALUE } from '../lib/productNames';
import { listPhotos } from '../lib/photoStore';
import { loadTechniqueBoardForDate } from '../lib/techniqueStore';
import type { VideoPlan } from '../lib/techniqueLogic';
import { loadTechniqueArchive, type TechniqueTreeArchive } from '../lib/techniqueTreeStore';
import {
  CLASS_DESIGNATION_MAX,
  CLASS_TIME_MAX,
  LESSON_TITLE_MAX,
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
  classBrowseFolders,
  classPlanRowLabel,
  copyPlan,
  emptyPlan,
  findPlanById,
  loadTrainingArchive,
  localDateKey,
  planDayStamp,
  planDayTitle,
  planHasContent,
  planListLabel,
  plansOnDay,
  searchLessonPlans,
  removeDayPlan,
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

type GalleryVideo = {
  id: string;
  label: string;
  mime: string;
  addedAt: number;
  blob: Blob;
};

type GalleryTodayState = {
  status: 'loading' | 'ready' | 'error';
  videos: GalleryVideo[];
};

type DriveTodayState = {
  status: TodayDriveStatus;
  videos: DriveDayVideo[];
};

const idleDriveNotice = { phase: 'idle' as const, text: '' };

function videoOffer(
  videos: TodayVideos | null,
  ref: LessonSlotRef,
): { show: boolean; slotId: string | null; clipUrl?: string; mediaName: string } {
  const count = videos ? videos.plan.slots.filter((slot) => slot.kind === 'technique').length : null;
  const show = lessonSlotOffersVideo(ref, count);
  if (!videos) return { show, slotId: null, mediaName: '' };
  const slot = parallelVideoSlot(videos.plan, ref);
  if (!slot) return { show, slotId: null, mediaName: '' };
  return {
    show,
    slotId: slot.slotId,
    clipUrl: slot.clipId ? videos.urls[slot.clipId] : undefined,
    mediaName: slot.mediaName?.trim() ?? '',
  };
}

export function TrainingNotesPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const proUnlocked = useProUnlocked();
  const [searchParams] = useSearchParams();
  const seat = useCurrentSeat();
  const lessonMenu = seatMenuAllowed(seat, 'dailyLessonPlanAccess');
  const lessonCloud = menuCloudSharing(proUnlocked, seat, lessonMenu);
  /**
   * Limited Coach is `/notes`. Owner Unlimited is the same page with `plan=unlimited`
   * and Pro on. A Pro invite inside the lesson menu gets that same cloud and sharing
   * even when this browser's Pro unlock is off.
   */
  const unlimitedPlan =
    lessonCloud && (isLiveSeat(seat) || searchParams.get('plan') === UNLIMITED_LESSON_VALUE);
  const driveRestoreNotice = restoreNoticeFromState(useLocation().state);
  const showDownload = visibleCoachControl('downloadTodaysVideos', { owner: true, seat });
  const showDistribute = unlimitedPlan;
  const lessonBlocked = isLiveSeat(seat) && !lessonMenu;
  useCoachPageSwipe();
  const [boot] = useState(() => {
    const today = localDateKey();
    const archive = loadTrainingArchive(today);
    const viewKey = restoredDayKey(searchParams.get('date'), today, (dateKey) => plansOnDay(archive, dateKey).length > 0);
    return { today, archive, viewKey, plan: plansOnDay(archive, viewKey)[0] ?? emptyPlan() };
  });
  const [todayKey, setTodayKey] = useState(boot.today);
  const [archive, setArchive] = useState<TrainingNotesArchive>(boot.archive);
  const [viewKey, setViewKey] = useState(boot.viewKey);
  const [plan, setPlan] = useState<TrainingNotesPlan>(boot.plan);
  const [classesOpen, setClassesOpen] = useState(false);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [videos, setVideos] = useState<TodayVideos | null>(null);
  const [galleryToday, setGalleryToday] = useState<GalleryTodayState>({ status: 'loading', videos: [] });
  const [driveToday, setDriveToday] = useState<DriveTodayState>({
    status: unlimitedPlan ? 'loading' : 'skipped',
    videos: [],
  });
  const [downloadNote, setDownloadNote] = useState('');
  const [distributeNote, setDistributeNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const driveNotice = useSyncExternalStore(subscribeDriveNotice, getDriveNotice, () => idleDriveNotice);
  const [treeArchive, setTreeArchive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());

  useEffect(() => {
    const roll = () => {
      const next = localDateKey();
      setTodayKey((current) => {
        if (current === next) return current;
        const loaded = loadTrainingArchive(next);
        setArchive(loaded);
        setViewKey(next);
        setPlan(plansOnDay(loaded, next)[0] ?? emptyPlan());
        setConfirmPlanId(null);
        setRemoveArmed(false);
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
    let cancelled = false;
    let created: string[] = [];
    const load = () => {
      setTreeArchive(loadTechniqueArchive());
      void loadTechniqueBoardForDate(viewKey)
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
  }, [viewKey]);

  useEffect(() => {
    if (!unlimitedPlan) {
      setGalleryToday({ status: 'ready', videos: [] });
      return;
    }
    let cancelled = false;
    const load = () => {
      void listPhotos('gallery')
        .then((rows) => {
          if (cancelled) return;
          setGalleryToday({ status: 'ready', videos: galleryVideosForDay(rows, viewKey) });
        })
        .catch(() => {
          if (!cancelled) setGalleryToday({ status: 'error', videos: [] });
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
    };
  }, [viewKey, unlimitedPlan]);

  useEffect(() => {
    if (!unlimitedPlan) {
      setDriveToday({ status: 'skipped', videos: [] });
      return;
    }
    let cancelled = false;
    setDriveToday({ status: 'loading', videos: [] });
    const load = () => {
      void loadTodayDriveVideos(viewKey)
        .then((result) => {
          if (!cancelled) setDriveToday(result);
        })
        .catch(() => {
          if (!cancelled) setDriveToday({ status: 'error', videos: [] });
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
    };
  }, [viewKey, unlimitedPlan]);

  useEffect(() => {
    const flush = () => flushLessonDriveDraft();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

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
  const classFolders = useMemo(() => classBrowseFolders(archive, todayKey), [archive, todayKey]);
  const openFolder =
    folderKey !== null ? (classFolders.find((folder) => folder.key === folderKey) ?? null) : null;
  const savedPlans = plansOnDay(archive, viewKey);
  const currentSaved = savedPlans.some((item) => item.id === plan.id);
  const classPlans =
    currentSaved || !editingToday ? savedPlans : savedPlans.length === 0 ? [plan] : [...savedPlans, plan];
  const yesterdayPlans = plansOnDay(archive, yesterdayKey).filter(planHasContent);
  const copyTargets = editingToday ? yesterdayPlans : planHasContent(plan) ? [plan] : [];
  const todayHasContent =
    plansOnDay(archive, todayKey).some(planHasContent) || (editingToday && planHasContent(plan));
  const confirmPlan = confirmPlanId ? findPlanById(archive, confirmPlanId) : null;

  const persistToday = (next: TrainingNotesPlan) => {
    const saved = saveDay(todayKey, next, todayKey);
    setArchive(saved.archive);
    setPlan(saved.plan);
    // Local text is already stored. Unlimited queues a Drive draft (text + file ids).
    // Limited Coach skips the queue. Either way, leaving the page does not drop the plan.
    // A previous day is opened from Class History, which reads the gym Drive folder.
    scheduleLessonDriveDraft({
      proSuite: unlimitedPlan,
      dateKey: todayKey,
      coachName: saved.plan.coachName,
      plan: saved.plan,
      media: videos ? mediaRefsFromVideoPlan(videos.plan) : [],
    });
    return saved;
  };

  const commit = (next: TrainingNotesPlan) => {
    if (!editingToday) return;
    persistToday(next);
  };

  const openDay = (key: string) => {
    setViewKey(key);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
    setPlan(plansOnDay(archive, key)[0] ?? emptyPlan());
  };

  const openSavedPlan = (dateKey: string, next: TrainingNotesPlan) => {
    setViewKey(dateKey);
    setPlan(next);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
  };

  const applyCopy = (source: TrainingNotesPlan) => {
    if (!planHasContent(source)) return;
    persistToday(copyPlan(source));
    setViewKey(todayKey);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
  };

  const requestCopy = (source: TrainingNotesPlan) => {
    if (!planHasContent(source)) return;
    if (todayHasContent) {
      setConfirmPlanId(source.id);
      setRemoveArmed(false);
      return;
    }
    applyCopy(source);
  };

  const addClassPlan = () => {
    if (!editingToday || !planHasContent(plan)) return;
    setPlan(emptyPlan());
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setViewKey(todayKey);
  };

  const removeClassPlan = () => {
    if (!editingToday) return;
    const nextArchive = removeDayPlan(todayKey, plan.id, todayKey);
    setArchive(nextArchive);
    const remaining = plansOnDay(nextArchive, todayKey);
    setPlan(remaining[0] ?? emptyPlan());
    setRemoveArmed(false);
    setConfirmPlanId(null);
  };

  const patchTechnique = (id: string, patch: Partial<TechniqueBlock>) => {
    commit({
      ...plan,
      techniques: plan.techniques.map((tech) => (tech.id === id ? { ...tech, ...patch } : tech)),
    });
  };

  const atMax = plan.techniques.length >= MAX_TECHNIQUES;
  const canRemoveClass = editingToday && (planHasContent(plan) || classPlans.length > 1);

  const openVideo = (ref: LessonSlotRef) => {
    const offer = videoOffer(videos, ref);
    if (!offer.show) return;
    navigate(
      techniquesFocusPath({
        section: ref.role,
        date: viewKey,
        slotId: offer.slotId,
        index: ref.role === 'technique' ? ref.index : undefined,
      }),
    );
  };

  const galleryCount = galleryToday.status === 'ready' ? galleryToday.videos.length : 0;
  const driveCount = driveToday.status === 'ready' ? driveToday.videos.length : 0;
  const galleryCopy = todayDownloadCopy({
    galleryStatus: galleryToday.status,
    galleryCount,
    driveStatus: driveToday.status,
    driveCount,
    dayLabel: viewKey === todayKey ? 'today' : planDayTitle(viewKey, todayKey),
  });
  const canDownloadToday = galleryCount + driveCount > 0;
  const downloadBusy = galleryToday.status === 'loading' || driveToday.status === 'loading';

  const downloadToday = async () => {
    if (!canDownloadToday) return;
    setDownloadNote('');
    let index = 0;
    if (galleryCount) {
      await downloadGalleryVideos(galleryToday.videos);
      index = galleryToday.videos.length;
    }
    if (!driveCount) return;
    try {
      const token = await requestDriveToken('silent');
      if (!token) {
        setDownloadNote('Sign in to Google Drive again to download those videos. The gallery copies already saved.');
        return;
      }
      for (const video of driveToday.videos) {
        const blob = await downloadDriveFile(token, video.id);
        saveBlobDownload(galleryVideoDownloadName(video.label, video.mime, index), blob);
        index += 1;
      }
    } catch (reason) {
      setDownloadNote(
        reason instanceof Error
          ? reason.message
          : 'A Google Drive video could not be downloaded. Gallery copies already saved stay on this phone.',
      );
    }
  };

  const sectionMedia = (ref: LessonSlotRef, label: string, tech?: TechniqueBlock) => {
    const offer = videoOffer(videos, ref);
    const linked = tech ? matchLessonTree(tech.title, tech.treeId, treeCandidates) : null;
    return (
      <LessonMediaRail
        showVideo={offer.show}
        videoLabel={label}
        clipUrl={offer.clipUrl}
        mediaName={offer.mediaName}
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
        to={unlimitedPlan ? COACH_UNLIMITED_PATH : parent.path}
        onExit={() => {
          navigate(unlimitedPlan ? COACH_UNLIMITED_PATH : parent.path);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{unlimitedPlan ? INSTRUCTOR_COACH_ENTRY : COACH_LESSON_EYEBROW}</p>
          <h1>{TRAINING_NOTES_LABEL}</h1>
        </div>
      </header>
      {unlimitedPlan ? <p className="notes__lead">{UNLIMITED_SHARE_LEAD}</p> : null}
      {unlimitedPlan ? <p className="notes__lead">{NOTES_LEAD}</p> : null}
      {lessonBlocked ? (
        <p className="notes__lead">This seat does not include the daily lesson plan.</p>
      ) : null}
      {unlimitedPlan && driveNotice.text ? (
        <p className="notes__save" role="status">
          {driveNotice.text}
        </p>
      ) : null}
      {unlimitedPlan && driveRestoreNotice ? (
        <p className="notes__save" role="status">
          {driveRestoreNotice}
        </p>
      ) : null}

      {lessonBlocked ? null : (
      <div className="notes__plan">
        {unlimitedPlan ? null : <OpenMyDrive />}
        {unlimitedPlan && !showDownload ? <OpenMyDrive /> : null}
        {unlimitedPlan ? (
          <Link className="btn btn--ghost notes__copy" to="/class-history">
            {OPEN_DRIVE_CLASS_LABEL}
          </Link>
        ) : null}
        <section className="notes__archive" aria-label="Saved days">
          <PlanDateNav
            todayKey={todayKey}
            viewKey={viewKey}
            activePlanId={plan.id}
            hitsFor={(query) => searchLessonPlans(archive, todayKey, query)}
            onOpenDate={openDay}
            onOpenHit={(dateKey, planId) => {
              const found = plansOnDay(archive, dateKey).find((item) => item.id === planId);
              if (found) openSavedPlan(dateKey, found);
              else openDay(dateKey);
            }}
          />
          <div className="notes__days">
            <button
              type="button"
              className={viewKey === todayKey ? 'notes__day notes__day--on' : 'notes__day'}
              aria-pressed={viewKey === todayKey}
              onClick={() => openDay(todayKey)}
            >
              Today
              {unlimitedPlan ? null : <span className="notes__day-date">{planDayStamp(todayKey)}</span>}
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
          {unlimitedPlan ? null : <p className="notes__when">{NOTES_LEAD}</p>}
          {unlimitedPlan ? null : (
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
            </section>
          )}
          {coachLessonGalleryDownload(unlimitedPlan) ? (
          <CollaborationGate show={showDownload}>
          <div className="notes__downloads">
            <button
              type="button"
              className="btn notes__download"
              disabled={!canDownloadToday}
              aria-describedby="notes-gallery-status"
              onClick={() => {
                void downloadToday();
              }}
            >
              {DOWNLOAD_TODAY_LABEL}
            </button>
            <OpenMyDrive />
            <p
              id="notes-gallery-status"
              className={
                canDownloadToday || downloadBusy
                  ? 'notes__gallery-status'
                  : 'notes__gallery-status notes__gallery-status--empty'
              }
              role="status"
            >
              {galleryCopy}
            </p>
            {downloadNote ? (
              <p className="notes__gallery-status notes__gallery-status--empty" role="status">
                {downloadNote}
              </p>
            ) : null}
            {canDownloadToday ? (
              <ul className="notes__gallery" aria-label="Videos available for today">
                {galleryToday.videos.map((video) => (
                  <li key={`gallery-${video.id}`}>{video.label}</li>
                ))}
                {driveToday.videos.map((video) => (
                  <li key={`drive-${video.id}`}>{video.label}</li>
                ))}
              </ul>
            ) : null}
          </div>
          </CollaborationGate>
          ) : null}
          {classesOpen ? (
            openFolder ? (
              <div className="notes__folders" aria-label={`${openFolder.label} dates`}>
                <button
                  type="button"
                  className="btn btn--ghost notes__folder-back"
                  onClick={() => setFolderKey(null)}
                >
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
                                {classPlanRowLabel(item)}
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
                {classFolders.map((folder) => {
                  const days = folder.dates.length;
                  return (
                    <li key={folder.key || 'unlabeled'}>
                      <button
                        type="button"
                        className="notes__recent-btn"
                        onClick={() => setFolderKey(folder.key)}
                      >
                        <span>{folder.label}</span>
                        <span>{days === 1 ? '1 day' : `${days} days`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="notes__recent-empty">No saved classes yet.</p>
            )
          ) : null}
          {confirmPlan ? (
            <div className="notes__confirm" role="group" aria-label="Add class plan to today">
              <p>Add {planListLabel(confirmPlan)} to today? Today's other class plans stay.</p>
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
                <button
                  key={source.id}
                  type="button"
                  className="btn notes__copy"
                  onClick={() => requestCopy(source)}
                >
                  {copyTargets.length === 1
                    ? editingToday
                      ? 'Copy yesterday'
                      : 'Copy into today'
                    : `Copy ${planListLabel(source)}`}
                </button>
              ))
            : null}
          {!editingToday && !planHasContent(plan) ? (
            <p className="notes__recent-empty">No plan saved for this day.</p>
          ) : null}
        </section>

        {classPlans.length > 1 || (editingToday && planHasContent(plan)) ? (
          <section className="notes__classes" aria-label="Class plans">
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
                      {planListLabel(item)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {editingToday ? (
              <div className="notes__class-actions">
                <button
                  type="button"
                  className="btn notes__add"
                  disabled={!planHasContent(plan)}
                  onClick={addClassPlan}
                >
                  Add class plan
                </button>
                {canRemoveClass && removeArmed ? (
                  <div className="notes__confirm" role="group" aria-label="Remove this class plan">
                    <p>
                      {classPlans.length > 1
                        ? `Remove ${planListLabel(plan)}? Other class plans on this day stay.`
                        : `Remove ${planListLabel(plan)}?`}
                    </p>
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
                {canRemoveClass && !removeArmed ? (
                  <button type="button" className="btn btn--ghost notes__copy" onClick={() => setRemoveArmed(true)}>
                    Remove this class plan
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="notes__card">
          {unlimitedPlan ? (
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
          ) : null}
          <div className="notes__pair">
            <label className="notes__field" htmlFor="notes-class">
              Class designation
              <input
                id="notes-class"
                value={plan.classDesignation}
                maxLength={CLASS_DESIGNATION_MAX}
                placeholder="GB1"
                autoComplete="off"
                readOnly={!editingToday}
                onChange={(event) => commit({ ...plan, classDesignation: event.target.value })}
              />
            </label>
            <label className="notes__field" htmlFor="notes-lesson-title">
              Lesson title
              <input
                id="notes-lesson-title"
                value={plan.lessonTitle}
                maxLength={LESSON_TITLE_MAX}
                autoComplete="off"
                readOnly={!editingToday}
                onChange={(event) => commit({ ...plan, lessonTitle: event.target.value })}
              />
            </label>
          </div>
          <label className="notes__field" htmlFor="notes-class-time">
            Class time
            <input
              id="notes-class-time"
              value={plan.classTime}
              maxLength={CLASS_TIME_MAX}
              placeholder="5:00 PM"
              autoComplete="off"
              readOnly={!editingToday}
              onChange={(event) => commit({ ...plan, classTime: event.target.value })}
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

        {editingToday && planHasContent(plan) ? (
          <aside className="notes__distribute" aria-label="Submit for review">
            <button
              type="button"
              className="btn notes__distribute-btn"
              onClick={() => {
                void listClassPhotoPromotions(todayKey).then((photos) => {
                  const photo = photos[photos.length - 1];
                  submitForReview({
                    revisionId: lessonDraftRevisionId(todayKey, plan.coachName, plan.id),
                    dateKey: todayKey,
                    coachName: plan.coachName,
                    plan,
                    photoId: photo?.id ?? '',
                    photoName: photo?.name ?? '',
                  });
                  setReviewNote(REVIEW_SUBMITTED);
                });
              }}
            >
              {REVIEW_SUBMIT}
            </button>
            {reviewNote ? (
              <p className="notes__distribute-note" role="status">
                {reviewNote}
              </p>
            ) : null}
          </aside>
        ) : null}
        {!unlimitedPlan && editingToday ? <CoachPlanExport dateKey={todayKey} plan={plan} /> : null}
        {showDistribute && editingToday ? (
          <>
            <aside className="notes__distribute" aria-label="Instructor distribution">
              <p>{DISTRIBUTE_LEAD}</p>
              <button
                type="button"
                className="btn btn--ghost notes__distribute-btn"
                onClick={() => {
                  const revision = markLessonDistribution({
                    proSuite: true,
                    dateKey: todayKey,
                    coachName: plan.coachName,
                    plan,
                    media: videos ? mediaRefsFromVideoPlan(videos.plan) : [],
                  });
                  setDistributeNote(revision ? DISTRIBUTE_DONE : DISTRIBUTE_LEAD);
                }}
              >
                {DISTRIBUTE_BUTTON}
              </button>
              {distributeNote ? (
                <p className="notes__distribute-note" role="status">
                  {distributeNote}
                </p>
              ) : null}
            </aside>
          </>
        ) : null}
        {showDistribute ? <ClassPhotoPromotions dateKey={viewKey} readOnly={!editingToday} /> : null}
      </div>
      )}
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
