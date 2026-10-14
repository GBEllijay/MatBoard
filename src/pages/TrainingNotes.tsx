import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ClassPhotoPromotions } from '../components/ClassPhotoPromotions';
import { DriveVideoFolders } from '../components/DriveVideoFolders';
import { CompetitionCurriculumPage } from './CompetitionCurriculum';
import { LessonScreenHide } from '../components/LessonScreenCover';
import { DriveHandoffCheck, DriveHandoffGuide, useDriveConnected } from '../components/DriveHandoffGuide';
import { LessonVersionHistory } from '../components/LessonVersionHistory';
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
  renameDriveFile,
  requestDriveToken,
  todayDownloadCopy,
  type DriveDayVideo,
  type DriveVideoGroup,
  type TodayDriveStatus,
} from '../lib/googleDrive';
import {
  lessonSlotOffersVideo,
  matchLessonTree,
  parallelVideoSlot,
  techniqueTreeLaunchPath,
  lessonVideoHref,
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
  DRIVE_HANDOFF_EMPTY,
  DRIVE_HANDOFF_SAVED,
  publishReviewToGym,
  pullReviewHandoff,
} from '../lib/driveHandoff';
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
import { REVIEW_SUBMIT, REVIEW_SUBMITTED, REVIEW_VERSION_LEAD, listPlanVersions, submitForReview } from '../lib/reviewInbox';
import {
  isLiveSeat,
  menuCloudSharing,
  seatMenuAllowed,
  visibleCoachControl,
} from '../lib/instructorSeats';
import {
  LESSON_TEMPLATE_LABELS,
  LESSON_TEMPLATES,
  MAX_GAMES,
  activeLessonTemplate,
  addLessonGame,
  addLessonTechnique,
  applyLessonTemplate,
  blockHeading,
  blockKey,
  lessonBlocks,
  moveLessonBlock,
  removeLessonBlock,
  templateAlreadyApplied,
  templateChangeNeedsConfirm,
  type GameBlock,
  type LessonTemplateId,
} from '../lib/lessonTemplates';
import { INSTRUCTOR_COACH_ENTRY, UNLIMITED_LESSON_VALUE, carryHubFrom } from '../lib/productNames';
import { classHistoryHref } from '../lib/submenuNav';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { listPhotos } from '../lib/photoStore';
import {
  adoptPlanVideos,
  lessonMediaFromPlanVideos,
  planVideoRefFor,
  planVideoRefsFromVideoPlan,
} from '../lib/planVideos';
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
  SPECIFIC_NOTE_MAX,
  TECHNIQUE_NOTES_MAX,
  TECHNIQUE_TITLE_MAX,
  WARMUP_NOTE_MAX,
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
  type PlanVideoRef,
  searchLessonPlans,
  removeDayPlan,
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
  groups: DriveVideoGroup[];
};

const idleDriveNotice = { phase: 'idle' as const, text: '' };

function clipUrlForRef(ref: PlanVideoRef, videos: TodayVideos | null): string | undefined {
  if (ref.url) return ref.url;
  if (ref.localClipId && videos?.urls[ref.localClipId]) return videos.urls[ref.localClipId];
  if (!ref.driveFileId || !videos) return undefined;
  const slot = videos.plan.slots.find((item) => item.driveFileId === ref.driveFileId && item.clipId);
  return slot?.clipId ? videos.urls[slot.clipId] : undefined;
}

function videoOffer(
  videos: TodayVideos | null,
  planVideos: PlanVideoRef[] | undefined,
  ref: LessonSlotRef,
): { show: boolean; slotId: string | null; clipUrl?: string; mediaName: string } {
  const count = videos ? videos.plan.slots.filter((slot) => slot.kind === 'technique').length : null;
  const show = lessonSlotOffersVideo(ref, count);
  const slot = videos ? parallelVideoSlot(videos.plan, ref) : null;
  if (planVideos) {
    const owned = planVideoRefFor(planVideos, ref.role, ref.role === 'technique' ? ref.index : undefined);
    return {
      show,
      slotId: slot?.slotId ?? null,
      clipUrl: owned ? clipUrlForRef(owned, videos) : undefined,
      mediaName: owned?.name.trim() ?? '',
    };
  }
  if (!slot) return { show, slotId: null, mediaName: '' };
  return {
    show,
    slotId: slot.slotId,
    clipUrl: slot.clipId ? videos?.urls[slot.clipId] : undefined,
    mediaName: slot.mediaName?.trim() ?? '',
  };
}

export function TrainingNotesPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const proUnlocked = useProUnlocked();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const exitPath = useSubmenuBack({ unlimited: unlimitedPlan }) ?? parent.path;
  const driveRestoreNotice = restoreNoticeFromState(useLocation().state);
  const showDownload = visibleCoachControl('downloadTodaysVideos', { owner: true, seat });
  const showDistribute = unlimitedPlan;
  const lessonBlocked = isLiveSeat(seat) && !lessonMenu;
  useCoachPageSwipe();
  const [boot] = useState(() => {
    const today = localDateKey();
    const archive = loadTrainingArchive(today);
    const viewKey = restoredDayKey(searchParams.get('date'), today, (dateKey) => plansOnDay(archive, dateKey).length > 0);
    const dayPlans = plansOnDay(archive, viewKey);
    const requested = searchParams.get('class');
    const plan = dayPlans.find((item) => item.id === requested) ?? dayPlans[0] ?? emptyPlan();
    return { today, archive, viewKey, plan };
  });
  const [todayKey, setTodayKey] = useState(boot.today);
  const [archive, setArchive] = useState<TrainingNotesArchive>(boot.archive);
  const [viewKey, setViewKey] = useState(boot.viewKey);
  const [plan, setPlan] = useState<TrainingNotesPlan>(boot.plan);
  const [classesOpen, setClassesOpen] = useState(false);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [confirmPlanId, setConfirmPlanId] = useState<string | null>(null);
  const [removeArmed, setRemoveArmed] = useState(false);
  const [templateAsk, setTemplateAsk] = useState<LessonTemplateId | null>(null);
  const [removeBlockKey, setRemoveBlockKey] = useState<string | null>(null);
  const [videos, setVideos] = useState<TodayVideos | null>(null);
  const [galleryToday, setGalleryToday] = useState<GalleryTodayState>({ status: 'loading', videos: [] });
  const [driveToday, setDriveToday] = useState<DriveTodayState>({
    status: unlimitedPlan ? 'loading' : 'skipped',
    videos: [],
    groups: [],
  });
  const [driveTick, setDriveTick] = useState(0);
  const [downloadNote, setDownloadNote] = useState('');
  const [distributeNote, setDistributeNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [handoffChecked, setHandoffChecked] = useState(false);
  const driveConnected = useDriveConnected();
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
      setDriveToday({ status: 'skipped', videos: [], groups: [] });
      return;
    }
    let cancelled = false;
    setDriveToday((current) =>
      driveTick === 0 ? { status: 'loading', videos: [], groups: [] } : { ...current, status: 'loading' },
    );
    const load = () => {
      void loadTodayDriveVideos(viewKey)
        .then((result) => {
          if (!cancelled) setDriveToday(result);
        })
        .catch(() => {
          if (!cancelled) setDriveToday({ status: 'error', videos: [], groups: [] });
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
  }, [viewKey, unlimitedPlan, driveTick]);

  useEffect(() => {
    if (!plan.id || searchParams.get('class') === plan.id) return;
    const next = new URLSearchParams(searchParams);
    next.set('class', plan.id);
    setSearchParams(next, { replace: true });
  }, [plan.id, searchParams, setSearchParams]);

  useEffect(() => {
    if (plan.videos || !videos || !planHasContent(plan)) return;
    const saved = adoptPlanVideos(viewKey, plan.id, planVideoRefsFromVideoPlan(videos.plan), todayKey);
    if (!saved) return;
    setArchive(loadTrainingArchive(todayKey));
    setPlan((current) => (current.id === saved.id && current.videos === undefined ? saved : current));
  }, [plan, videos, viewKey, todayKey]);

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
    // A plan that has never stored its own videos picks up the day's board once.
    // A plan with an empty list keeps that empty list.
    const stamped =
      next.videos === undefined && videos
        ? { ...next, videos: planVideoRefsFromVideoPlan(videos.plan) }
        : next;
    const saved = saveDay(todayKey, stamped, todayKey);
    setArchive(saved.archive);
    setPlan(saved.plan);
    // Local text is already stored. Unlimited queues a Drive draft (text + file ids).
    // Limited Coach skips the queue. Either way, leaving the page does not drop the plan.
    // A previous day is opened from Class History, which reads the gym Drive folder.
    const media = saved.plan.videos
      ? lessonMediaFromPlanVideos(saved.plan.videos)
      : videos
        ? mediaRefsFromVideoPlan(videos.plan)
        : [];
    scheduleLessonDriveDraft({
      proSuite: unlimitedPlan,
      dateKey: todayKey,
      coachName: saved.plan.coachName,
      plan: saved.plan,
      media,
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
    setTemplateAsk(null);
    setRemoveBlockKey(null);
  };

  const openSavedPlan = (dateKey: string, next: TrainingNotesPlan) => {
    setViewKey(dateKey);
    setPlan(next);
    setConfirmPlanId(null);
    setRemoveArmed(false);
    setClassesOpen(false);
    setFolderKey(null);
    setTemplateAsk(null);
    setRemoveBlockKey(null);
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
    if (plan.videos === undefined && videos) {
      const adopted = adoptPlanVideos(todayKey, plan.id, planVideoRefsFromVideoPlan(videos.plan), todayKey);
      if (adopted) {
        setArchive(loadTrainingArchive(todayKey));
      }
    }
    const next = emptyPlan();
    next.videos = [];
    setPlan(next);
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

  const competitionAllowed = proUnlocked || unlimitedPlan;
  const showCompetition = activeLessonTemplate(plan) === 'competition' && competitionAllowed;
  const orderedBlocks = lessonBlocks(plan);
  const atMax = orderedBlocks.filter((block) => block.kind === 'technique').length >= MAX_TECHNIQUES;
  const atMaxGames = orderedBlocks.filter((block) => block.kind === 'game').length >= MAX_GAMES;
  const canRemoveClass = editingToday && (planHasContent(plan) || classPlans.length > 1);

  const requestTemplate = (template: LessonTemplateId) => {
    if (!editingToday) return;
    if (template === 'competition' && !competitionAllowed) return;
    if (templateAlreadyApplied(plan, template)) {
      setTemplateAsk(null);
      return;
    }
    if (templateChangeNeedsConfirm(plan)) {
      setTemplateAsk(template);
      setRemoveBlockKey(null);
      return;
    }
    setTemplateAsk(null);
    commit(applyLessonTemplate(plan, template));
  };

  const applyAskedTemplate = () => {
    if (!templateAsk) return;
    commit(applyLessonTemplate(plan, templateAsk));
    setTemplateAsk(null);
    setRemoveBlockKey(null);
  };

  const openVideo = (ref: LessonSlotRef) => {
    const offer = videoOffer(videos, plan.videos, ref);
    if (!offer.show) return;
    navigate(
      lessonVideoHref({
        section: ref.role,
        date: viewKey,
        slotId: offer.slotId,
        index: ref.role === 'technique' ? ref.index : undefined,
        search: searchParams.toString(),
        classId: plan.id,
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

  const renameDriveClip = async (fileId: string, name: string) => {
    const silent = await requestDriveToken('silent');
    const token = silent ?? (await requestDriveToken('consent'));
    if (!token) throw new Error('Sign in to Google Drive again to rename this clip.');
    await renameDriveFile(token, fileId, name);
    setDriveTick((value) => value + 1);
  };

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
    const offer = videoOffer(videos, plan.videos, ref);
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
        onOpenTree={
          tech
            ? (treeId) => navigate(carryHubFrom(techniqueTreeLaunchPath(treeId), searchParams.toString()))
            : undefined
        }
        treeLibraryTo={carryHubFrom('/technique-tree', searchParams.toString())}
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
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{unlimitedPlan ? INSTRUCTOR_COACH_ENTRY : COACH_LESSON_EYEBROW}</p>
          <h1>{TRAINING_NOTES_LABEL}</h1>
        </div>
      </header>
      {lessonBlocked ? null : <LessonScreenHide />}
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
        <LessonTemplatePicker
          template={activeLessonTemplate(plan)}
          competitionAllowed={competitionAllowed}
          readOnly={!editingToday}
          onPick={requestTemplate}
        />
        {templateAsk ? (
          <div className="notes__confirm" role="group" aria-label="Apply class template">
            <p>{templateConfirmCopy(templateAsk)}</p>
            <div className="notes__confirm-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setTemplateAsk(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={applyAskedTemplate}>
                Apply template
              </button>
            </div>
          </div>
        ) : null}
        {!competitionAllowed ? (
          <p className="notes__when">Competition class is included with Coach Unlimited and Pro.</p>
        ) : null}
        {unlimitedPlan ? null : <OpenMyDrive />}
        {unlimitedPlan && !showDownload ? <OpenMyDrive /> : null}
        {unlimitedPlan ? (
          <Link className="btn btn--ghost notes__copy" to={classHistoryHref('/notes', searchParams.toString())}>
            {OPEN_DRIVE_CLASS_LABEL}
          </Link>
        ) : null}
        {showCompetition ? <CompetitionCurriculumPage embedded /> : (
        <>
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
            {galleryToday.videos.length || driveToday.groups.length ? (
              <DriveVideoFolders
                selectedDate={viewKey}
                groups={driveToday.groups}
                gallery={galleryToday.videos.map((video) => ({
                  id: video.id,
                  label: video.label,
                  addedAt: video.addedAt,
                }))}
                onRename={renameDriveClip}
              />
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
                        if (plan.videos === undefined && videos && planHasContent(plan)) {
                          const adopted = adoptPlanVideos(
                            viewKey,
                            plan.id,
                            planVideoRefsFromVideoPlan(videos.plan),
                            todayKey,
                          );
                          if (adopted) setArchive(loadTrainingArchive(todayKey));
                        }
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
        </section>

        {orderedBlocks.map((block, index) => {
          const key = blockKey(block, index);
          const techniqueOrdinal = orderedBlocks.slice(0, index + 1).filter((item) => item.kind === 'technique').length;
          const gameOrdinal = orderedBlocks.slice(0, index + 1).filter((item) => item.kind === 'game').length;
          const heading = blockHeading(block, techniqueOrdinal, gameOrdinal);
          const tech = block.kind === 'technique' ? plan.techniques.find((item) => item.id === block.id) : undefined;
          const game = block.kind === 'game' ? plan.games?.find((item) => item.id === block.id) : undefined;
          return (
            <div key={key} className="notes__block">
              {block.kind === 'intro' ? (
                <section className="notes__card">
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
              ) : null}
              {block.kind === 'warmup' ? (
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
              ) : null}
              {block.kind === 'technique' && tech ? (
                <TechniqueBlockView
                  index={techniqueOrdinal - 1}
                  tech={tech}
                  readOnly={!editingToday}
                  onChange={(patch) => patchTechnique(tech.id, patch)}
                  media={sectionMedia({ role: 'technique', index: techniqueOrdinal - 1 }, heading, tech)}
                />
              ) : null}
              {block.kind === 'game' && game ? (
                <GameBlockView
                  heading={heading}
                  game={game}
                  readOnly={!editingToday}
                  onChange={(patch) =>
                    commit({
                      ...plan,
                      games: (plan.games ?? []).map((item) => (item.id === game.id ? { ...item, ...patch } : item)),
                    })
                  }
                />
              ) : null}
              {block.kind === 'specific' ? (
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
              ) : null}
              {block.kind === 'cooldown' ? (
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
              ) : null}
              {block.kind === 'closing' ? (
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
              ) : null}
              {editingToday ? (
                <BlockTools
                  heading={heading}
                  index={index}
                  count={orderedBlocks.length}
                  confirming={removeBlockKey === key}
                  onMove={(direction) => {
                    setRemoveBlockKey(null);
                    commit(moveLessonBlock(plan, index, direction));
                  }}
                  onAskRemove={() => setRemoveBlockKey(key)}
                  onCancelRemove={() => setRemoveBlockKey(null)}
                  onRemove={() => {
                    commit(removeLessonBlock(plan, index));
                    setRemoveBlockKey(null);
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {editingToday ? (
          <div className="notes__add-row">
            <button
              type="button"
              className="btn notes__add"
              disabled={atMax}
              onClick={() => {
                setRemoveBlockKey(null);
                commit(addLessonTechnique(plan));
              }}
            >
              Add technique
            </button>
            <button
              type="button"
              className="btn notes__add"
              disabled={atMaxGames}
              onClick={() => {
                setRemoveBlockKey(null);
                commit(addLessonGame(plan));
              }}
            >
              Add game
            </button>
          </div>
        ) : null}

        {editingToday && planHasContent(plan) ? (
          <aside className="notes__distribute" aria-label="Submit for review">
            {listPlanVersions(todayKey, plan.id).length === 0 ? <p>{REVIEW_VERSION_LEAD}</p> : null}
            <button
              type="button"
              className="btn notes__distribute-btn"
              onClick={() => {
                void listClassPhotoPromotions(todayKey).then((photos) => {
                  const photo = photos[photos.length - 1];
                  const submitted = submitForReview({
                    revisionId: lessonDraftRevisionId(todayKey, plan.coachName, plan.id),
                    dateKey: todayKey,
                    coachName: plan.coachName,
                    plan,
                    photoId: photo?.id ?? '',
                    photoName: photo?.name ?? '',
                  });
                  setReviewNote(REVIEW_SUBMITTED);
                  setHandoffChecked(false);
                  void publishReviewToGym(submitted).then((sent) => {
                    setHandoffNote(sent === 'saved' ? DRIVE_HANDOFF_SAVED : '');
                  });
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
            {handoffNote ? (
              <p className="notes__distribute-note" role="status">
                {handoffNote}
              </p>
            ) : null}
            {driveConnected ? null : <DriveHandoffGuide />}
            <DriveHandoffCheck
              on={handoffChecked}
              onClick={() => {
                void pullReviewHandoff().then((result) => {
                  if (result === 'connect') {
                    setHandoffChecked(false);
                    setHandoffNote('');
                    return;
                  }
                  setHandoffChecked(true);
                  setHandoffNote(result === 'saved' ? DRIVE_HANDOFF_SAVED : DRIVE_HANDOFF_EMPTY);
                });
              }}
            />
          </aside>
        ) : null}
        <LessonVersionHistory versions={listPlanVersions(viewKey, plan.id)} />
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
                    media: plan.videos
                      ? lessonMediaFromPlanVideos(plan.videos)
                      : videos
                        ? mediaRefsFromVideoPlan(videos.plan)
                        : [],
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
        </>
        )}
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
  onChange,
  media,
}: {
  index: number;
  tech: TechniqueBlock;
  readOnly: boolean;
  onChange: (patch: Partial<TechniqueBlock>) => void;
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
          <div className="notes__section-side">{media}</div>
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

function GameBlockView({
  heading,
  game,
  readOnly,
  onChange,
}: {
  heading: string;
  game: GameBlock;
  readOnly: boolean;
  onChange: (patch: Partial<GameBlock>) => void;
}) {
  const titleId = `notes-game-${game.id}`;
  const notesId = `notes-game-notes-${game.id}`;
  return (
    <div className="notes__block">
      <section className="notes__card" aria-labelledby={`notes-game-heading-${game.id}`}>
        <h2 id={`notes-game-heading-${game.id}`}>{heading}</h2>
        <label className="notes__field" htmlFor={titleId}>
          Title
          <input
            id={titleId}
            value={game.title}
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
              id={`notes-game-time-${game.id}`}
              value={game.expected}
              readOnly={readOnly}
              onChange={(expected) => onChange({ expected })}
            />
          </div>
          <textarea
            id={notesId}
            value={game.notes}
            rows={4}
            maxLength={TECHNIQUE_NOTES_MAX}
            readOnly={readOnly}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        </div>
      </section>
      <button
        type="button"
        className={game.waterBreak ? 'notes__break notes__break--on' : 'notes__break'}
        role="switch"
        aria-checked={game.waterBreak}
        aria-label={`Water break after ${heading}`}
        disabled={readOnly}
        onClick={() => onChange({ waterBreak: !game.waterBreak })}
      >
        <span className="notes__switch" aria-hidden="true" />
        <span className="notes__break-copy">
          <span className="notes__break-label">Water break</span>
          {game.waterBreak ? <span className="notes__break-hint">Before the next section</span> : null}
        </span>
        <span className="notes__break-state">{game.waterBreak ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

function LessonTemplatePicker({
  template,
  competitionAllowed,
  readOnly,
  onPick,
}: {
  template: LessonTemplateId;
  competitionAllowed: boolean;
  readOnly: boolean;
  onPick: (template: LessonTemplateId) => void;
}) {
  return (
    <div className="presets notes__templates" role="radiogroup" aria-label="Class template">
      {LESSON_TEMPLATES.map((id) => {
        const locked = id === 'competition' && !competitionAllowed;
        const on = template === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`preset${on ? ' preset--on' : ''}`}
            disabled={locked}
            aria-disabled={readOnly || locked}
            onClick={() => {
              if (readOnly || locked) return;
              onPick(id);
            }}
          >
            {LESSON_TEMPLATE_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

function templateConfirmCopy(template: LessonTemplateId): string {
  if (template === 'competition') {
    return 'Open the Competition class on this plan? Lesson notes stay on this plan. The competition curriculum keeps its own saved days.';
  }
  if (template === 'kids') {
    return 'Apply the Kids class template? This sets the starting blocks: Technique 1, a Game, then Technique 2. Notes on the blocks that remain stay. You can reorder them after.';
  }
  return 'Apply the Adult class template? This sets the starting blocks: Intro, three techniques, Cool down, Closing, and the other sections. Notes on the blocks that remain stay.';
}

function BlockTools({
  heading,
  index,
  count,
  confirming,
  onMove,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  heading: string;
  index: number;
  count: number;
  confirming: boolean;
  onMove: (direction: -1 | 1) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  if (confirming) {
    return (
      <div className="notes__confirm" role="group" aria-label={`Remove ${heading}`}>
        <p>Remove {heading}?</p>
        <div className="notes__confirm-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancelRemove}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="notes__block-tools">
      <button type="button" className="btn btn--ghost notes__remove" onClick={onAskRemove}>
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
  );
}
