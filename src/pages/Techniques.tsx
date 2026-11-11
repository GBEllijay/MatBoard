import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AdvantageCloudPanel } from '../components/AdvantageCloudMedia';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { DriveMediaPicker } from '../components/DriveMediaPicker';
import { OpenMyDrive } from '../components/OpenMyDrive';
import { Sheet } from '../components/Sheet';
import { ClipDock } from '../components/ClipDock';
import { FocusShell } from '../components/FocusShell';
import { LessonCoverProvider, LessonScreenHide } from '../components/LessonScreenCover';
import { LoopClip } from '../components/LoopClip';
import { PlayExitMark } from '../components/PlayExitMark';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { SeatSessionBar, useCurrentSeat } from '../components/SeatSessionBar';
import { TvTip } from '../components/TvTip';
import { VideoSourceSheet } from '../components/VideoSourceSheet';
import { useInterval } from '../hooks/useClock';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { instructorSeatBinderLabel, isLiveSeat, menuCloudSharing, seatMenuAllowed } from '../lib/instructorSeats';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  CURRICULUM_VIDEO_PARAM,
  curriculumVideoCardById,
  curriculumVideoCardsOnDay,
  type CurriculumVideoCard,
} from '../lib/curriculumVideos';
import { loadCurriculumArchive, writeCurriculumBlockClip } from '../lib/competitionCurriculum';
import { lessonExpectedText, loopSecondsForSlot } from '../lib/expectedDuration';
import { formatMmSs, formatMss, secondsToMs } from '../lib/format';
import { downloadDriveFile, getDriveBindingSnapshot, requestDriveToken, subscribeDriveBinding } from '../lib/googleDrive';
import {
  TRAINING_DRIVE_CONNECT_LABEL,
  TRAINING_DRIVE_CONNECT_TITLE,
  TRAINING_DRIVE_OPEN_LABEL,
  getDriveNotice,
  subscribeDriveNotice,
  syncTodayTrainingVideos,
  trainingClipHandoff,
  trainingClipStayCopy,
  trainingDriveConnectHint,
} from '../lib/lessonDrive';
import { lessonBlockCopy } from '../lib/focusLayout';
import { lessonBlocks } from '../lib/lessonTemplates';
import {
  lessonFocusStatus,
  parseLessonVideoFocus,
  resolveFocusedSlot,
} from '../lib/lessonLinks';
import type { DriveBrowseMedia } from '../lib/driveMediaPicker';
import { VIDEO_CAPTURE, VIDEO_PICKER_ACCEPT, VIDEO_RECORD_ACCEPT } from '../lib/mediaPicker';
import { DEFAULT_MUTE_VIDEO } from '../lib/photoStore';
import { safeTimerReturn } from '../lib/timerReturn';
import { techniquesPageEyebrow } from '../lib/productNames';
import {
  isWithinRetention,
  loadTrainingArchive,
  localDateKey,
  plansOnDay,
  type TrainingNotesPlan,
} from '../lib/trainingNotesStore';
import { LARGE_MEDIA_BYTES, LARGE_MEDIA_NOTE, quotaAddNote } from '../lib/storageQuota';
import {
  canAssignClip,
  clipCount,
  DRILL_PRESETS_SEC,
  insertTechniqueSlot,
  isDrillPreset,
  isTimedSlot,
  techniqueIndex,
  MAX_DRILL_SEC,
  MAX_TECHNIQUE_SLOTS,
  MIN_DRILL_SEC,
  nextTechniqueSlotId,
  pickAddableVideos,
  remainingOnStart,
  selectSlot,
  setSlotClip,
  setSlotDrill,
  slotTitle,
  tickRemainingMs,
  type VideoPlan,
  type VideoSlot,
} from '../lib/techniqueLogic';
import {
  attachClipToSlot,
  clearSlotClip,
  deleteUnusedTrainingClip,
  loadTechniqueBoardForDate,
  readTrainingClip,
  readTrainingClipBlob,
  loadTechniqueBoard,
  saveTechniquePlan,
  saveTrainingClip,
  storeRestoredDriveClip,
  type TechniqueClip,
} from '../lib/techniqueStore';
import { lessonPlanVideoOverlay, planVideoRefsFromVideoPlan, videoPlanWithPlanVideos, writeLessonPlanVideos } from '../lib/planVideos';
import { CLOUD_SAVED_MESSAGE, cloudUploadSelected, notifyCloudMedia, uploadAdvantageCloudFile } from '../lib/advantageCloudMedia';

async function loadSharedCurriculumCards(clips: readonly TechniqueClip[]): Promise<{
  cards: CurriculumVideoCard[];
  clips: TechniqueClip[];
}> {
  const today = localDateKey();
  const archive = loadCurriculumArchive(today);
  const cards = curriculumVideoCardsOnDay(archive, today);
  const requested = new URLSearchParams(window.location.search).get(CURRICULUM_VIDEO_PARAM);
  if (requested && !cards.some((card) => card.blockId === requested)) {
    const extra = curriculumVideoCardById(archive, requested);
    if (extra) cards.push(extra);
  }
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  for (const card of cards) {
    if (!card.clipId || byId.has(card.clipId)) continue;
    const blob = await readTrainingClipBlob(card.clipId);
    if (!blob) continue;
    const row = await readTrainingClip(card.clipId);
    if (row) byId.set(row.id, row);
  }
  return { cards, clips: [...byId.values()] };
}

function lessonCopyForSlot(
  plan: TrainingNotesPlan | null,
  slot: VideoSlot | null,
  techniqueOrdinal: number,
): { title: string; notes: string } {
  if (!plan || !slot) return { title: '', notes: '' };
  const blocks = lessonBlocks(plan);
  if (slot.kind === 'warmup') {
    const block = blocks.find((item) => item.kind === 'warmup');
    return block ? lessonBlockCopy(plan, block) : { title: 'Warm-up', notes: plan.warmupNote };
  }
  if (slot.kind === 'cooldown') {
    const block = blocks.find((item) => item.kind === 'cooldown');
    return block ? lessonBlockCopy(plan, block) : { title: 'Cool down', notes: plan.cooldownNote };
  }
  const block = blocks.filter((item) => item.kind === 'technique')[techniqueOrdinal];
  if (!block) return { title: '', notes: '' };
  return lessonBlockCopy(plan, block);
}

function classLessonPlan(dateKey: string, planId: string | null): TrainingNotesPlan | null {
  const id = planId?.trim() ?? '';
  if (!id) return null;
  return plansOnDay(loadTrainingArchive(dateKey), dateKey).find((item) => item.id === id) ?? null;
}

const idleDriveNotice = { phase: 'idle' as const, text: '' };

export function TechniquesPage() {
  const seat = useCurrentSeat();
  const videosMenu = seatMenuAllowed(seat, 'downloadTodaysVideos');
  const proUnlocked = useProUnlocked();
  const coachUnlocked = useCoachUnlocked();
  const proSuite = menuCloudSharing(proUnlocked, seat, videosMenu);
  const seatedAuthorized = isLiveSeat(seat) && videosMenu;
  const driveBinding = useSyncExternalStore(subscribeDriveBinding, getDriveBindingSnapshot, () => null);
  const driveNotice = useSyncExternalStore(subscribeDriveNotice, getDriveNotice, () => idleDriveNotice);
  const handoff = trainingClipHandoff({
    proSuite,
    driveConnected: Boolean(driveBinding),
    seatedAuthorized,
  });
  const stayCopy = trainingClipStayCopy({
    proSuite,
    driveConnected: Boolean(driveBinding),
    seatedAuthorized,
  });
  const shareDay = handoff.share;
  const eyebrow = techniquesPageEyebrow(proUnlocked, coachUnlocked, isLiveSeat(seat));
  const seatRole = seat ? instructorSeatBinderLabel(seat.presetId, seat.permissions) : '';
  const [clips, setClips] = useState<TechniqueClip[]>([]);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muteVideo, setMuteVideo] = useState(DEFAULT_MUTE_VIDEO);
  const [unlockSound, setUnlockSound] = useState(false);
  const [pickerNote, setPickerNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [drivePickOpen, setDrivePickOpen] = useState(false);
  const [driveConnectOpen, setDriveConnectOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    if (!driveConnectOpen || !driveBinding) return;
    setDriveConnectOpen(false);
    setDrivePickOpen(true);
  }, [driveConnectOpen, driveBinding]);
  const [remainingMs, setRemainingMs] = useState(secondsToMs(300));
  const [customSlotId, setCustomSlotId] = useState<string | null>(null);
  const pickerSlotRef = useRef<string | null>(null);
  const planRef = useRef<VideoPlan | null>(null);
  const recordRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const fs = usePlayFullscreen({ auto: false });
  const [stage, setStage] = useState(false);
  const fsActiveRef = useRef(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const exitPath = useSubmenuBack() ?? '/coach';
  useCoachPageSwipe();
  const launchStarted = useRef(false);
  const launchKey = searchParams.toString();
  const focusDate = parseLessonVideoFocus(searchParams).date;
  const boardDate = focusDate && isWithinRetention(focusDate, localDateKey()) ? focusDate : localDateKey();
  const boardDateRef = useRef(boardDate);
  boardDateRef.current = boardDate;
  const lessonPlanIdRef = useRef<string | null>(new URLSearchParams(launchKey).get('class'));
  const [lessonPlan, setLessonPlan] = useState<TrainingNotesPlan | null>(null);
  const lessonPlanRef = useRef<TrainingNotesPlan | null>(null);
  lessonPlanRef.current = lessonPlan;
  const secondsFor = (videoPlan: VideoPlan, slot: VideoSlot) =>
    loopSecondsForSlot(
      slot,
      lessonExpectedText(lessonPlanRef.current, slot, techniqueIndex(videoPlan, slot.slotId)),
    );
  if (new URLSearchParams(launchKey).get('class')) {
    lessonPlanIdRef.current = new URLSearchParams(launchKey).get('class');
  }
  const [lessonFocus, setLessonFocus] = useState<{ slotId: string; text: string } | null>(null);
  const [curriculumCards, setCurriculumCards] = useState<CurriculumVideoCard[]>([]);
  const [curriculumPick, setCurriculumPick] = useState<string | null>(null);
  const [playingCurriculum, setPlayingCurriculum] = useState(false);
  const [curriculumRemaining, setCurriculumRemaining] = useState(0);
  const curriculumPickerRef = useRef<string | null>(null);
  const [backPath, setBackPath] = useState<string | null>(null);
  const playback = playing || playingCurriculum;

  useVisibleViewportHeight();
  useWakeLock(playback);

  const immersive = fs.active || stage;

  useEffect(() => {
    if (fsActiveRef.current && !fs.active) setStage(false);
    fsActiveRef.current = fs.active;
  }, [fs.active]);

  useEffect(() => {
    if (!playback) setStage(false);
  }, [playback]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setStage(false);
      void fs.exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fs.exit]);

  const requestPlaybackFullscreen = async () => {
    if (fs.active || stage) return;
    if (playback) setStage(true);
    await fs.enter();
  };

  const togglePlaybackFullscreen = async () => {
    if (fs.active || stage) {
      setStage(false);
      await fs.exit();
      return;
    }
    await requestPlaybackFullscreen();
  };

  const applyPlan = (next: VideoPlan) => {
    planRef.current = next;
    setPlan(next);
  };

  const rememberLessonVideos = (next: VideoPlan) => {
    const planId = lessonPlanIdRef.current;
    if (!planId) return;
    writeLessonPlanVideos(boardDateRef.current, planId, planVideoRefsFromVideoPlan(next));
  };

  useEffect(() => {
    let cancelled = false;
    void loadTechniqueBoardForDate(boardDate)
      .then(async (board) => {
        if (cancelled) return;
        const found =
          classLessonPlan(boardDate, lessonPlanIdRef.current) ??
          (new URLSearchParams(window.location.search).get('from') === 'coach'
            ? (plansOnDay(loadTrainingArchive(boardDate), boardDate)[0] ?? null)
            : null);
        lessonPlanRef.current = found;
        setLessonPlan(found);
        const overlay = lessonPlanVideoOverlay(boardDate, lessonPlanIdRef.current);
        const shown = overlay === null ? board.plan : videoPlanWithPlanVideos(board.plan, overlay);
        applyPlan(shown);
        const shared = await loadSharedCurriculumCards(board.clips);
        if (cancelled) return;
        setCurriculumCards(shared.cards);
        setClips(shared.clips);
        const selected = shown.slots.find((slot) => slot.slotId === shown.selectedSlotId);
        if (selected && isTimedSlot(selected)) setRemainingMs(secondsToMs(secondsFor(shown, selected)));
      })
      .catch(() => {
        if (!cancelled) setPickerNote('Could not open clips on this device.');
      });
    return () => {
      cancelled = true;
    };
  }, [boardDate]);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const clipIdsKey = clips.map((clip) => `${clip.id}:${clip.addedAt}`).join('|');

  const [urlById, setUrlById] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const clip of clipsRef.current) {
      next[clip.id] = URL.createObjectURL(clip.blob);
    }
    setUrlById(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [clipIdsKey]);

  const selected = useMemo(
    () => plan?.slots.find((slot) => slot.slotId === plan.selectedSlotId) ?? null,
    [plan],
  );
  const selectedClip = selected?.clipId ? clips.find((clip) => clip.id === selected.clipId) : null;
  const selectedSrc = selectedClip ? urlById[selectedClip.id] : undefined;
  const pickedCard = curriculumCards.find((card) => card.blockId === curriculumPick) ?? null;
  const pickedSrc = pickedCard?.clipId ? urlById[pickedCard.clipId] : undefined;
  const clipOnScreen = `${pickedCard?.clipId ?? ''}|${selected?.clipId ?? ''}`;
  const [heardClip, setHeardClip] = useState(clipOnScreen);
  if (heardClip !== clipOnScreen) {
    setHeardClip(clipOnScreen);
    setMuteVideo(true);
    setUnlockSound(false);
  }
  const canStart = pickedCard
    ? Boolean(pickedCard.clipId && pickedSrc && !playingCurriculum)
    : Boolean(selected?.clipId && selectedSrc && !playing);
  const count =
    (plan ? clipCount(plan) : 0) +
    curriculumCards.filter((card) => card.clipId && urlById[card.clipId]).length;
  const techniqueCount = plan ? plan.slots.filter((slot) => slot.kind === 'technique').length : 0;
  const atSlotMax = techniqueCount >= MAX_TECHNIQUE_SLOTS;

  const persistPlan = async (next: VideoPlan) => {
    applyPlan(next);
    try {
      await saveTechniquePlan(next, boardDateRef.current);
      rememberLessonVideos(next);
    } catch {
      setPickerNote('Could not save this plan on this device.');
    }
  };

  const selectCard = (slotId: string) => {
    setCurriculumPick(null);
    setPlayingCurriculum(false);
    const current = planRef.current;
    if (!current || current.selectedSlotId === slotId) return;
    setLessonFocus((currentFocus) => (currentFocus?.slotId === slotId ? currentFocus : null));
    const next = selectSlot(current, slotId);
    const slot = next.slots.find((item) => item.slotId === slotId);
    setPlaying(false);
    if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(secondsFor(next, slot)));
    void persistPlan(next);
  };

  const commitMute = (next: boolean) => {
    setMuteVideo(next);
    if (!next) setUnlockSound(true);
    else setUnlockSound(false);
  };

  const commitDrill = (slotId: string, nextSec: number) => {
    const current = planRef.current;
    if (!current || playing) return;
    const base = current.selectedSlotId === slotId ? current : selectSlot(current, slotId);
    const next = setSlotDrill(base, slotId, nextSec);
    if (next === current) return;
    const slot = next.slots.find((item) => item.slotId === slotId);
    if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(secondsFor(next, slot)));
    setPlaying(false);
    void persistPlan(next);
  };

  const startDrill = () => {
    if (pickedCard) {
      if (!pickedCard.clipId || !pickedSrc || playingCurriculum) return;
      if (!muteVideo) setUnlockSound(true);
      setPlaying(false);
      setCurriculumRemaining(pickedCard.durationMs);
      setPlayingCurriculum(true);
      return;
    }
    if (!selected?.clipId || !selectedSrc || playing) return;
    if (!muteVideo) setUnlockSound(true);
    if (isTimedSlot(selected) && plan) {
      setRemainingMs((ms) => remainingOnStart(ms, secondsToMs(secondsFor(plan, selected))));
    }
    setPlaying(true);
  };

  const stopDrill = () => {
    setPlaying(false);
    setPlayingCurriculum(false);
  };

  useInterval(
    useCallback(() => {
      setRemainingMs((ms) => {
        const next = tickRemainingMs(ms, 100);
        if (next === 0) setPlaying(false);
        return next;
      });
    }, []),
    100,
    playing && Boolean(selected && isTimedSlot(selected)),
  );

  useEffect(() => {
    if (!plan) return;
    const id = playing ? plan.selectedSlotId : lessonFocus?.slotId;
    if (!id) return;
    document.getElementById(`techniques-slot-${id}`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [playing, plan, lessonFocus]);

  useEffect(() => {
    const params = new URLSearchParams(launchKey);
    const back = safeTimerReturn(params.get('back'));
    if (back) setBackPath(back);
    const blockId = params.get(CURRICULUM_VIDEO_PARAM);
    if (!blockId) return;
    const card = curriculumCards.find((item) => item.blockId === blockId);
    if (!card) return;
    setCurriculumPick(blockId);
    const src = card.clipId ? urlById[card.clipId] : undefined;
    const ready = Boolean(card.clipId && src) || !card.clipId;
    if (card.clipId && src && !launchStarted.current) {
      launchStarted.current = true;
      setMuteVideo(true);
      setUnlockSound(false);
      setPlaying(false);
      setCurriculumRemaining(card.durationMs);
      setPlayingCurriculum(true);
    } else if (!card.clipId && !card.locked && !launchStarted.current) {
      launchStarted.current = true;
      openCurriculumChooser(card);
    }
    if (!ready) return;
    window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (!next.has(CURRICULUM_VIDEO_PARAM) && !next.has('back')) return;
      next.delete(CURRICULUM_VIDEO_PARAM);
      next.delete('back');
      setSearchParams(next, { replace: true });
    }, 0);
    document.getElementById(`techniques-slot-curriculum-${blockId}`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [curriculumCards, launchKey, setSearchParams, urlById]);

  useEffect(() => {
    if (!plan) return;
    if (new URLSearchParams(launchKey).has(CURRICULUM_VIDEO_PARAM)) return;
    const focus = parseLessonVideoFocus(new URLSearchParams(launchKey));
    if (!focus.active) return;
    const slot = resolveFocusedSlot(plan, focus);
    let cancelled = false;
    const clearLaunch = () => {
      window.setTimeout(() => {
        if (cancelled) return;
        const next = new URLSearchParams(window.location.search);
        const keys = ['slot', 'play', 'focus', 'section', 'index', 'date'] as const;
        if (!keys.some((key) => next.has(key))) return;
        for (const key of keys) next.delete(key);
        setSearchParams(next, { replace: true });
      }, 0);
    };

    if (!slot) {
      if (focus.focus) setPickerNote('That lesson section is not on Daily Training Videos yet.');
      clearLaunch();
      return () => {
        cancelled = true;
      };
    }

    setLessonFocus({ slotId: slot.slotId, text: lessonFocusStatus(plan, focus, slot) });

    if (plan.selectedSlotId !== slot.slotId) {
      const next = selectSlot(plan, slot.slotId);
      applyPlan(next);
      setPlaying(false);
      if (isTimedSlot(slot)) setRemainingMs(secondsToMs(secondsFor(next, slot)));
      void saveTechniquePlan(next, boardDateRef.current)
        .then(() => rememberLessonVideos(next))
        .catch(() => {
          setPickerNote('Could not save this plan on this device.');
        });
      return () => {
        cancelled = true;
      };
    }

    const src = slot.clipId ? urlById[slot.clipId] : undefined;
    const waitingForClip = Boolean(focus.play && slot.clipId && !src);
    if (focus.play && slot.clipId && src && !launchStarted.current) {
      launchStarted.current = true;
      setMuteVideo(true);
      setUnlockSound(false);
      if (isTimedSlot(slot)) {
        setRemainingMs((ms) => remainingOnStart(ms, secondsToMs(secondsFor(plan, slot))));
      }
      setPlaying(true);
    } else if (!focus.play) {
      setPlaying(false);
    }
    if (!waitingForClip) clearLaunch();
    return () => {
      cancelled = true;
    };
  }, [plan, urlById, launchKey, setSearchParams]);

  const openDrivePick = () => {
    setAddOpen(false);
    if (!driveBinding) {
      setDriveConnectOpen(true);
      return;
    }
    setDrivePickOpen(true);
  };

  const importDriveVideos = async (chosen: readonly DriveBrowseMedia[]) => {
    const curriculumId = curriculumPickerRef.current;
    const slotId = pickerSlotRef.current;
    const current = planRef.current;
    setDrivePickOpen(false);
    const [item] = chosen;
    if (!item) return;
    const token = (await requestDriveToken('silent')) ?? (await requestDriveToken('consent'));
    if (!token) {
      setPickerNote('Sign in to Google Drive again to pick that video.');
      return;
    }
    const mime = item.mime || 'video/mp4';
    try {
      if (curriculumId) {
        curriculumPickerRef.current = null;
        const blob = await downloadDriveFile(token, item.id);
        const file = new File([blob], item.name || 'Drive video', { type: mime });
        const card = curriculumCards.find((row) => row.blockId === curriculumId);
        const saved = await saveTrainingClip(file, card?.title || item.name);
        if (!card || !saved) {
          setPickerNote('That Google Drive video could not be opened. It stays in the gym folder.');
          return;
        }
        const previous = card.clipId;
        const savedPlan = writeCurriculumBlockClip(card.blockId, saved.id, file.name || saved.label);
        if (!savedPlan) {
          void deleteUnusedTrainingClip(saved.id);
          setPickerNote('That curriculum card is not on this phone anymore.');
          return;
        }
        if (previous && previous !== saved.id) void deleteUnusedTrainingClip(previous);
        setCurriculumCards((rows) =>
          rows.map((row) =>
            row.blockId === card.blockId ? { ...row, clipId: saved.id, mediaName: file.name || saved.label } : row,
          ),
        );
        setClips((rows) => [...rows.filter((clip) => clip.id !== previous && clip.id !== saved.id), saved]);
        return;
      }
      if (!slotId || !current) return;
      const linked = await storeRestoredDriveClip({
        driveFileId: item.id,
        blob: null,
        mime,
        label: item.name,
      });
      if (linked) {
        const next = selectSlot(
          setSlotClip(current, slotId, linked, {
            driveFileId: item.id,
            mediaName: item.name,
            mediaMime: mime,
          }),
          slotId,
        );
        await saveTechniquePlan(next, boardDateRef.current);
        applyPlan(next);
        rememberLessonVideos(next);
        setClips((await loadTechniqueBoard()).clips);
        if (shareDay) syncTodayTrainingVideos(next, true);
        return;
      }
      const blob = await downloadDriveFile(token, item.id);
      const file = new File([blob], item.name || 'Drive video', { type: mime || blob.type || 'video/mp4' });
      const result = await attachClipToSlot(current, slotId, file, item.id);
      applyPlan(result.plan);
      rememberLessonVideos(result.plan);
      setClips(result.clips);
      setPlaying(false);
      if (result.status === 'invalid') {
        setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
        return;
      }
      if (result.status === 'added' || result.status === 'replaced') syncTodayTrainingVideos(result.plan, shareDay);
    } catch {
      setPickerNote('That Google Drive video could not be opened. It stays in the gym folder.');
    }
  };

  const openChooser = (slot: VideoSlot) => {
    const current = planRef.current;
    if (!current || !canAssignClip(current, slot.slotId)) return;
    curriculumPickerRef.current = null;
    pickerSlotRef.current = slot.slotId;
    setReplacing(Boolean(slot.clipId));
    setAddOpen(true);
    if (current.selectedSlotId !== slot.slotId) {
      const next = selectSlot(current, slot.slotId);
      setPlaying(false);
      if (isTimedSlot(slot)) setRemainingMs(secondsToMs(secondsFor(next, slot)));
      void persistPlan(next);
    }
  };

  const onFiles = async (files: readonly File[]) => {
    const curriculumId = curriculumPickerRef.current;
    if (curriculumId) {
      curriculumPickerRef.current = null;
      setAddOpen(false);
      const card = curriculumCards.find((item) => item.blockId === curriculumId);
      const [file] = pickAddableVideos([...files], 1);
      if (!card || card.locked || !file) {
        if (file && card?.locked) setPickerNote('Unlock today\'s curriculum to change this video.');
        else if (files.length) setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
        return;
      }
      try {
        const saved = await saveTrainingClip(file, card.title);
        if (!saved) {
          setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
          return;
        }
        const previous = card.clipId;
        const savedPlan = writeCurriculumBlockClip(card.blockId, saved.id, file.name || saved.label);
        if (!savedPlan) {
          void deleteUnusedTrainingClip(saved.id);
          setPickerNote('That curriculum card is not on this phone anymore.');
          return;
        }
        if (previous && previous !== saved.id) void deleteUnusedTrainingClip(previous);
        setCurriculumCards((current) =>
          current.map((item) =>
            item.blockId === card.blockId ? { ...item, clipId: saved.id, mediaName: file.name || saved.label } : item,
          ),
        );
        setClips((current) => [...current.filter((clip) => clip.id !== previous && clip.id !== saved.id), saved]);
        setPlayingCurriculum(false);
        setPickerNote(file.size >= LARGE_MEDIA_BYTES ? LARGE_MEDIA_NOTE : '');
      } catch (error) {
        setPickerNote(quotaAddNote(error) ?? 'Could not save that clip on this device. Try again.');
      }
      return;
    }
    const slotId = pickerSlotRef.current;
    const current = planRef.current;
    setAddOpen(false);
    if (!files.length || !slotId || !current) return;
    const [file] = pickAddableVideos([...files], 1);
    if (!file) {
      setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
      return;
    }
    try {
      const result = await attachClipToSlot(current, slotId, file);
      applyPlan(result.plan);
      rememberLessonVideos(result.plan);
      setClips(result.clips);
      setPlaying(false);
      if (result.status === 'invalid') {
        setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
        return;
      }
      setPickerNote(file.size >= LARGE_MEDIA_BYTES ? LARGE_MEDIA_NOTE : '');
      if (result.status === 'added' || result.status === 'replaced') {
        if (cloudUploadSelected()) {
          void uploadAdvantageCloudFile({
            purpose: 'daily-video',
            dateKey: boardDateRef.current,
            file,
            fileName: file.name,
            mime: file.type || 'video/mp4',
          }).then((uploaded) => {
            setPickerNote(uploaded.ok ? CLOUD_SAVED_MESSAGE : uploaded.message);
            if (uploaded.ok) notifyCloudMedia();
          });
        } else {
          syncTodayTrainingVideos(result.plan, shareDay);
        }
      }
      const slot = result.plan.slots.find((item) => item.slotId === slotId);
      if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(secondsFor(result.plan, slot)));
    } catch (error) {
      setPickerNote(quotaAddNote(error) ?? 'Could not save that clip on this device. Try again.');
    }
  };

  const removeClip = async (slotId: string) => {
    const current = planRef.current;
    if (!current) return;
    try {
      const result = await clearSlotClip(current, slotId);
      applyPlan(result.plan);
      rememberLessonVideos(result.plan);
      setClips(result.clips);
      if (planRef.current?.selectedSlotId === slotId) setPlaying(false);
      setPickerNote('');
      if (result.status === 'removed') syncTodayTrainingVideos(result.plan, shareDay);
    } catch {
      setPickerNote('Could not remove that clip on this device.');
    }
  };

  const addTechnique = () => {
    const current = planRef.current;
    if (!current) return;
    const next = insertTechniqueSlot(current, nextTechniqueSlotId(current));
    if (!next) return;
    void persistPlan(next);
  };

  const openCurriculumChooser = (card: CurriculumVideoCard) => {
    if (card.locked) return;
    setCurriculumPick(card.blockId);
    setPlayingCurriculum(false);
    setPlaying(false);
    curriculumPickerRef.current = card.blockId;
    pickerSlotRef.current = null;
    setReplacing(Boolean(card.clipId));
    setAddOpen(true);
  };

  const removeCurriculumClip = async (card: CurriculumVideoCard) => {
    if (card.locked || !card.clipId) return;
    const clipId = card.clipId;
    writeCurriculumBlockClip(card.blockId, null, '');
    await deleteUnusedTrainingClip(clipId);
    setCurriculumCards((current) =>
      current.map((item) => (item.blockId === card.blockId ? { ...item, clipId: null, mediaName: '' } : item)),
    );
    setClips((current) => current.filter((clip) => clip.id !== clipId));
    setPlayingCurriculum(false);
    setPickerNote('');
  };

  const exitBoard = () => {
    setPlaying(false);
    setPlayingCurriculum(false);
    const destination = backPath ?? exitPath;
    void fs.exit().finally(() => {
      navigate(destination);
    });
  };

  if (isLiveSeat(seat) && !videosMenu) return <Navigate to="/coach" replace />;

  const warmup = plan?.slots.find((slot) => slot.kind === 'warmup') ?? null;
  const cooldown = plan?.slots.find((slot) => slot.kind === 'cooldown') ?? null;
  const techniques = plan?.slots.filter((slot) => slot.kind === 'technique') ?? [];
  const playerDock = (active: boolean, playingThis: boolean): ReactNode =>
    active ? (
      <ClipDock
        playing={playingThis}
        canStart={canStart}
        fullscreen={immersive}
        showFullscreen={fs.supported || stage || immersive}
        onStart={startDrill}
        onStop={stopDrill}
        onToggleFullscreen={() => {
          if (!playback && canStart) startDrill();
          void togglePlaybackFullscreen();
        }}
      />
    ) : null;

  const coachFocus = searchParams.get('from') === 'coach';
  const focusSlots = [warmup, ...techniques, cooldown].filter((slot): slot is VideoSlot => slot != null);
  const focusIndex = Math.max(
    0,
    focusSlots.findIndex((slot) => slot.slotId === plan?.selectedSlotId),
  );
  const focusSlot = focusSlots[focusIndex] ?? null;
  const focusOrdinal = focusSlot?.kind === 'technique' ? techniques.findIndex((slot) => slot.slotId === focusSlot.slotId) + 1 : 0;
  const focusCopy = lessonCopyForSlot(lessonPlan, focusSlot, Math.max(0, focusOrdinal - 1));
  const focusName =
    focusCopy.title ||
    (focusSlot ? slotTitle(focusSlot, Math.max(0, focusOrdinal - 1)) : 'Daily Training Videos');

  const renderFocusSlot = (slot: VideoSlot, parts: 'player' | 'controls') => {
    if (!plan) return null;
    const index = techniques.findIndex((item) => item.slotId === slot.slotId);
    const loopSec = secondsFor(plan, slot);
    const timedEnds = slot.kind === 'warmup' || slot.kind === 'cooldown';
    return (
      <SlotCard
        key={`${parts}-${slot.slotId}`}
        parts={parts}
        slot={slot}
        title={slotTitle(slot, Math.max(0, index))}
        fromLesson={lessonFocus?.slotId === slot.slotId}
        selected={plan.selectedSlotId === slot.slotId}
        playing={playing && plan.selectedSlotId === slot.slotId}
        src={slot.clipId ? urlById[slot.clipId] : undefined}
        muted={muteVideo}
        unlockSound={unlockSound}
        canAdd={canAssignClip(plan, slot.slotId)}
        loopSec={slot.kind === 'technique' ? loopSec : undefined}
        remainingMs={plan.selectedSlotId === slot.slotId ? remainingMs : secondsToMs(loopSec)}
        customOpen={customSlotId === slot.slotId || (slot.kind === 'technique' && !isDrillPreset(loopSec))}
        timersLocked={playing}
        timedLoopMs={timedEnds && lessonPlan ? loopSecondsForSlot(slot, slot.kind === 'warmup' ? lessonPlan.warmupExpected : lessonPlan.cooldownExpected) * 1000 : undefined}
        onSelect={() => selectCard(slot.slotId)}
        onAdd={() => openChooser(slot)}
        onRemove={() => void removeClip(slot.slotId)}
        onDrill={
          slot.kind === 'technique'
            ? (seconds) => {
                setCustomSlotId((current) => (current === slot.slotId ? null : current));
                commitDrill(slot.slotId, seconds);
              }
            : undefined
        }
        onCustom={
          slot.kind === 'technique'
            ? () => {
                setCustomSlotId(slot.slotId);
                selectCard(slot.slotId);
              }
            : undefined
        }
        onNudge={slot.kind === 'technique' ? (delta) => commitDrill(slot.slotId, loopSec + delta) : undefined}
        fullscreen={immersive}
        onToggleFullscreen={() => void togglePlaybackFullscreen()}
        onStop={stopDrill}
        onToggleMute={() => commitMute(!muteVideo)}
      />
    );
  };

  if (coachFocus) {
    const stepLabel = focusSlot
      ? focusSlot.kind === 'technique'
        ? `Technique ${focusOrdinal} of ${techniques.length}`
        : focusSlot.kind === 'warmup'
          ? 'Warm-up'
          : 'Cool down'
      : 'Class';
    return (
      <main
        className={`techniques techniques--focus${playback ? ' techniques--play' : ''}${fs.className ? ` ${fs.className}` : ''}${stage ? ' techniques--fill' : ''}`}
      >
        <PlayExitMark to={backPath ?? exitPath} onExit={exitBoard} />
        <LessonCoverProvider>
          <FocusShell
            eyebrow={eyebrow}
            title="Training videos"
            more={
              <>
                <SeatSessionBar />
                {seat ? <p>{`Seated as ${seatRole}.`}</p> : null}
                {handoff.lead ? <p>{handoff.lead}</p> : null}
                <p>{handoff.warning}</p>
                <OpenMyDrive
                  openLabel={shareDay ? TRAINING_DRIVE_OPEN_LABEL : undefined}
                  connectLabel={shareDay ? TRAINING_DRIVE_CONNECT_LABEL : undefined}
                  connectTitle={shareDay ? TRAINING_DRIVE_CONNECT_TITLE : undefined}
                  connectHint={shareDay ? trainingDriveConnectHint(seatedAuthorized) : undefined}
                />
                <AdvantageCloudPanel purpose="daily-video" dateKey={boardDate} />
              </>
            }
            player={
              <>
                {pickedCard ? (
                  <CurriculumClipCard
                    card={pickedCard}
                    selected
                    playing={playingCurriculum}
                    src={pickedSrc}
                    remainingMs={curriculumRemaining}
                    muted={muteVideo}
                    unlockSound={unlockSound}
                    fullscreen={immersive}
                    onSelect={() => {
                      setPlaying(false);
                      setPlayingCurriculum(false);
                    }}
                    onAdd={() => openCurriculumChooser(pickedCard)}
                    onRemove={() => void removeCurriculumClip(pickedCard)}
                    onDurationEnd={() => {
                      setPlayingCurriculum(false);
                      setCurriculumRemaining(0);
                    }}
                    onRemaining={setCurriculumRemaining}
                    onToggleFullscreen={() => void togglePlaybackFullscreen()}
                    onStop={stopDrill}
                    onToggleMute={() => commitMute(!muteVideo)}
                  />
                ) : focusSlot ? (
                  renderFocusSlot(focusSlot, 'player')
                ) : (
                  <div className="focus-shell__plate">Opening today&apos;s videos</div>
                )}
                {playerDock(
                  Boolean(pickedCard || focusSlot),
                  pickedCard ? playingCurriculum : Boolean(playing && focusSlot && plan?.selectedSlotId === focusSlot.slotId),
                )}
              </>
            }
            stepLabel={stepLabel}
            onPrev={() => {
              const next = focusSlots[focusIndex - 1];
              if (next) selectCard(next.slotId);
            }}
            onNext={() => {
              const next = focusSlots[focusIndex + 1];
              if (next) selectCard(next.slotId);
            }}
            prevDisabled={focusIndex <= 0}
            nextDisabled={focusIndex < 0 || focusIndex >= focusSlots.length - 1}
            summaryTitle={pickedCard ? pickedCard.title : focusName}
            summaryText={pickedCard ? '' : focusCopy.notes}
            hide={<LessonScreenHide />}
            tabs={[
              {
                id: 'clips',
                label: 'Clips',
                panel: (
                  <ol className="focus-outline">
                    {focusSlots.map((slot) => {
                      const ordinal = slot.kind === 'technique' ? techniques.findIndex((item) => item.slotId === slot.slotId) + 1 : 0;
                      const copy = lessonCopyForSlot(lessonPlan, slot, Math.max(0, ordinal - 1));
                      const name = copy.title || slotTitle(slot, Math.max(0, ordinal - 1));
                      const now = !pickedCard && slot.slotId === focusSlot?.slotId;
                      const seconds = plan ? secondsFor(plan, slot) : 0;
                      return (
                        <li key={slot.slotId}>
                          <button
                            type="button"
                            className={now ? 'focus-row focus-row--now' : 'focus-row'}
                            onClick={() => selectCard(slot.slotId)}
                          >
                            <span className="focus-row__title">{slot.kind === 'technique' ? `${ordinal}. ${name}` : name}</span>
                            {seconds > 0 ? <span className="focus-row__time">{formatMss(seconds)}</span> : null}
                            {now ? <span className="focus-row__now">Now</span> : null}
                          </button>
                        </li>
                      );
                    })}
                    {curriculumCards.map((card) => (
                      <li key={card.blockId}>
                        <button
                          type="button"
                          className={curriculumPick === card.blockId ? 'focus-row focus-row--now' : 'focus-row'}
                          onClick={() => {
                            setCurriculumPick(card.blockId);
                            setPlaying(false);
                            setPlayingCurriculum(false);
                            setCurriculumRemaining(card.durationMs);
                          }}
                        >
                          <span className="focus-row__title">{card.title}</span>
                          <span className="focus-row__time">{formatMmSs(card.durationMs)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ),
              },
              {
                id: 'notes',
                label: 'Notes',
                panel: (
                  <div className="focus-shell__summary">
                    <h2 className="focus-shell__summary-title">{focusName}</h2>
                    <p>{focusCopy.notes.trim() || 'No notes for this section yet.'}</p>
                  </div>
                ),
              },
              {
                id: 'details',
                label: 'Details',
                panel: (
                  <>
                    {pickerNote ? <p role="status">{pickerNote}</p> : null}
                    {driveNotice.text ? <p role="status">{driveNotice.text}</p> : null}
                    <p>{count === 1 ? '1 clip' : `${count} clips`}</p>
                    {focusSlot ? renderFocusSlot(focusSlot, 'controls') : null}
                    <button type="button" className="btn" disabled={!plan || atSlotMax} onClick={addTechnique}>
                      Add another
                    </button>
                  </>
                ),
              },
            ]}
          />
          <TvTip onFullscreen={() => void requestPlaybackFullscreen()} />
          <VideoSourceSheet
            open={addOpen}
            title={replacing ? 'Replace video' : 'Add video'}
            recordInputId="techniques-video-record"
            libraryInputId="techniques-video-library"
            stay={stayCopy}
            driveOpenLabel={shareDay ? TRAINING_DRIVE_OPEN_LABEL : undefined}
            driveConnectLabel={shareDay ? TRAINING_DRIVE_CONNECT_LABEL : undefined}
            driveConnectTitle={shareDay ? TRAINING_DRIVE_CONNECT_TITLE : undefined}
            driveConnectHint={shareDay ? trainingDriveConnectHint(seatedAuthorized) : undefined}
            onPickDrive={openDrivePick}
            onClose={() => setAddOpen(false)}
          />
          <DriveMediaPicker
            open={drivePickOpen}
            kind="video"
            onClose={() => setDrivePickOpen(false)}
            onDone={(files) => {
              void importDriveVideos(files);
            }}
          />
          <Sheet open={driveConnectOpen && !driveBinding} title="Connect with" onClose={() => setDriveConnectOpen(false)} stacked>
            <DriveConnectCard />
          </Sheet>
          <DeviceMediaInput
            id="techniques-video-record"
            inputRef={recordRef}
            accept={VIDEO_RECORD_ACCEPT}
            capture={VIDEO_CAPTURE}
            onFiles={onFiles}
          />
          <DeviceMediaInput
            id="techniques-video-library"
            inputRef={libraryRef}
            accept={VIDEO_PICKER_ACCEPT}
            onFiles={onFiles}
          />
        </LessonCoverProvider>
      </main>
    );
  }

  return (
    <main
      className={`techniques${playback ? ' techniques--play' : ''}${fs.className ? ` ${fs.className}` : ''}${stage ? ' techniques--fill' : ''}`}
    >
      <PlayExitMark to={backPath ?? exitPath} onExit={exitBoard} />
      <header className="techniques__bar">
        <div className="techniques__brand">
          <p className="techniques__eyebrow">{eyebrow}</p>
          <h1>Daily Training Videos</h1>
        </div>
        <div className="techniques__actions">
          <button
            type="button"
            className={`techniques__mute${muteVideo ? ' techniques__mute--on' : ''}`}
            aria-pressed={muteVideo}
            onClick={() => commitMute(!muteVideo)}
          >
            Mute clips
          </button>
          <p className="techniques__count">
            {count} {count === 1 ? 'clip' : 'clips'}
          </p>
        </div>
        <SeatSessionBar />
        <OpenMyDrive
          openLabel={shareDay ? TRAINING_DRIVE_OPEN_LABEL : undefined}
          connectLabel={shareDay ? TRAINING_DRIVE_CONNECT_LABEL : undefined}
          connectTitle={shareDay ? TRAINING_DRIVE_CONNECT_TITLE : undefined}
          connectHint={shareDay ? trainingDriveConnectHint(seatedAuthorized) : undefined}
        />
      </header>

      {playback ? null : (
        <section className="techniques__handoff" aria-label="How clips reach the gym">
          {seat ? (
            <p className="techniques__context">
              {shareDay
                ? `Seated as ${seatRole}. In this menu you share clips the same way the gym owner does. This is not the gym owner console.`
                : `Seated as ${seatRole}. This is not the gym owner console.`}
            </p>
          ) : null}
          <h2>{shareDay ? 'Share this day' : 'On this device'}</h2>
          {handoff.lead ? <p>{handoff.lead}</p> : null}
          {handoff.action ? <p>{handoff.action}</p> : null}
          <p className="techniques__handoff-warn">{handoff.warning}</p>
        </section>
      )}
      {playback ? null : <AdvantageCloudPanel purpose="daily-video" dateKey={boardDate} />}
      {playback || !shareDay || !driveNotice.text ? null : (
        <p className="techniques__note" role="status">
          {driveNotice.text}
        </p>
      )}

      {lessonFocus ? (
        <p className="techniques__focus" role="status">
          {lessonFocus.text}
        </p>
      ) : null}

      {pickerNote ? (
        <p className="techniques__note" role="status">
          {pickerNote}
        </p>
      ) : null}

      {plan ? (
      <div className="techniques__plan">
        {warmup ? (
          <SlotCard
            slot={warmup}
            title={slotTitle(warmup, 0)}
            fromLesson={lessonFocus?.slotId === warmup.slotId}
            selected={plan?.selectedSlotId === warmup.slotId}
            playing={playing && plan?.selectedSlotId === warmup.slotId}
            src={warmup.clipId ? urlById[warmup.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, warmup.slotId) : false}
            onSelect={() => selectCard(warmup.slotId)}
            onAdd={() => openChooser(warmup)}
            onRemove={() => void removeClip(warmup.slotId)}
            timedLoopMs={lessonPlan ? loopSecondsForSlot(warmup, lessonPlan.warmupExpected) * 1000 : undefined}
            fullscreen={immersive}
            dock={playerDock(
              !curriculumPick && plan?.selectedSlotId === warmup.slotId,
              playing && plan?.selectedSlotId === warmup.slotId,
            )}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => commitMute(!muteVideo)}
          />
        ) : null}

        {techniques.map((slot, index) => {
          const loopSec = secondsFor(plan, slot);
          return (
          <SlotCard
            key={slot.slotId}
            slot={slot}
            title={slotTitle(slot, index)}
            fromLesson={lessonFocus?.slotId === slot.slotId}
            selected={plan?.selectedSlotId === slot.slotId}
            playing={playing && plan?.selectedSlotId === slot.slotId}
            src={slot.clipId ? urlById[slot.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, slot.slotId) : false}
            loopSec={loopSec}
            remainingMs={plan?.selectedSlotId === slot.slotId ? remainingMs : secondsToMs(loopSec)}
            customOpen={customSlotId === slot.slotId || !isDrillPreset(loopSec)}
            timersLocked={playing}
            onSelect={() => selectCard(slot.slotId)}
            onAdd={() => openChooser(slot)}
            onRemove={() => void removeClip(slot.slotId)}
            onDrill={(seconds) => {
              setCustomSlotId((current) => (current === slot.slotId ? null : current));
              commitDrill(slot.slotId, seconds);
            }}
            onCustom={() => {
              setCustomSlotId(slot.slotId);
              selectCard(slot.slotId);
            }}
            onNudge={(delta) => commitDrill(slot.slotId, loopSec + delta)}
            fullscreen={immersive}
            dock={playerDock(
              !curriculumPick && plan?.selectedSlotId === slot.slotId,
              playing && plan?.selectedSlotId === slot.slotId,
            )}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => void commitMute(!muteVideo)}
          />
          );
        })}

        <button type="button" className="btn techniques__add" disabled={!plan || atSlotMax} onClick={addTechnique}>
          + Add another
        </button>

        {cooldown ? (
          <SlotCard
            slot={cooldown}
            title={slotTitle(cooldown, 0)}
            fromLesson={lessonFocus?.slotId === cooldown.slotId}
            selected={plan?.selectedSlotId === cooldown.slotId}
            playing={playing && plan?.selectedSlotId === cooldown.slotId}
            src={cooldown.clipId ? urlById[cooldown.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, cooldown.slotId) : false}
            onSelect={() => selectCard(cooldown.slotId)}
            onAdd={() => openChooser(cooldown)}
            onRemove={() => void removeClip(cooldown.slotId)}
            timedLoopMs={lessonPlan ? loopSecondsForSlot(cooldown, lessonPlan.cooldownExpected) * 1000 : undefined}
            fullscreen={immersive}
            dock={playerDock(
              !curriculumPick && plan?.selectedSlotId === cooldown.slotId,
              playing && plan?.selectedSlotId === cooldown.slotId,
            )}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => commitMute(!muteVideo)}
          />
        ) : null}

        {curriculumCards.map((card) => (
          <CurriculumClipCard
            key={card.blockId}
            card={card}
            selected={curriculumPick === card.blockId}
            playing={playingCurriculum && curriculumPick === card.blockId}
            src={card.clipId ? urlById[card.clipId] : undefined}
            remainingMs={curriculumRemaining}
            muted={muteVideo}
            unlockSound={unlockSound}
            fullscreen={immersive}
            onSelect={() => {
              setCurriculumPick(card.blockId);
              setPlaying(false);
              setPlayingCurriculum(false);
              setCurriculumRemaining(card.durationMs);
            }}
            onAdd={() => openCurriculumChooser(card)}
            onRemove={() => void removeCurriculumClip(card)}
            onDurationEnd={() => {
              setPlayingCurriculum(false);
              setCurriculumRemaining(0);
            }}
            onRemaining={setCurriculumRemaining}
            dock={playerDock(curriculumPick === card.blockId, playingCurriculum && curriculumPick === card.blockId)}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => commitMute(!muteVideo)}
          />
        ))}
      </div>
      ) : null}

      <TvTip onFullscreen={() => void requestPlaybackFullscreen()} />
      <VideoSourceSheet
        open={addOpen}
        title={replacing ? 'Replace video' : 'Add video'}
        recordInputId="techniques-video-record"
        libraryInputId="techniques-video-library"
        stay={stayCopy}
        driveOpenLabel={shareDay ? TRAINING_DRIVE_OPEN_LABEL : undefined}
        driveConnectLabel={shareDay ? TRAINING_DRIVE_CONNECT_LABEL : undefined}
        driveConnectTitle={shareDay ? TRAINING_DRIVE_CONNECT_TITLE : undefined}
        driveConnectHint={shareDay ? trainingDriveConnectHint(seatedAuthorized) : undefined}
        onPickDrive={openDrivePick}
        onClose={() => setAddOpen(false)}
      />
      <DriveMediaPicker
        open={drivePickOpen}
        kind="video"
        onClose={() => setDrivePickOpen(false)}
        onDone={(files) => {
          void importDriveVideos(files);
        }}
      />
      <Sheet
        open={driveConnectOpen && !driveBinding}
        title="Connect with"
        onClose={() => setDriveConnectOpen(false)}
        stacked
      >
        <DriveConnectCard />
      </Sheet>
      <DeviceMediaInput
        id="techniques-video-record"
        inputRef={recordRef}
        accept={VIDEO_RECORD_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="techniques-video-library"
        inputRef={libraryRef}
        accept={VIDEO_PICKER_ACCEPT}
        onFiles={onFiles}
      />
    </main>
  );
}

function CurriculumClipCard({
  card,
  selected,
  playing,
  src,
  remainingMs,
  muted,
  unlockSound,
  fullscreen,
  onSelect,
  onAdd,
  onRemove,
  onDurationEnd,
  onRemaining,
  dock,
  onToggleFullscreen,
  onStop,
  onToggleMute,
}: {
  card: CurriculumVideoCard;
  selected: boolean;
  playing: boolean;
  src?: string;
  remainingMs: number;
  muted: boolean;
  unlockSound: boolean;
  fullscreen: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onDurationEnd: () => void;
  onRemaining: (remainingMs: number) => void;
  dock?: ReactNode;
  onToggleFullscreen?: () => void;
  onStop?: () => void;
  onToggleMute?: () => void;
}) {
  const filled = Boolean(card.clipId && src);
  const cardClass = [
    'techniques__card',
    selected ? 'techniques__card--on' : '',
    playing ? 'techniques__card--playing' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      id={`techniques-slot-curriculum-${card.blockId}`}
      className={cardClass}
      aria-labelledby={`techniques-heading-curriculum-${card.blockId}`}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, label')) return;
        onSelect();
      }}
    >
      <h2 id={`techniques-heading-curriculum-${card.blockId}`}>{card.title}</h2>
      <div className="techniques__player" data-player="">
      {playing && filled && src ? (
        <LoopClip
          src={src}
          label={card.title}
          playing
          muted={muted}
          unlockSound={unlockSound}
          fullscreen={fullscreen}
          durationMs={card.durationMs}
          onDurationEnd={onDurationEnd}
          onRemaining={onRemaining}
          dock={dock}
          onToggleFullscreen={onToggleFullscreen}
          onStop={onStop}
          onToggleMute={onToggleMute}
          overlay={
            <p
              className={`techniques__clock${remainingMs === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
              aria-live="polite"
            >
              <span className="techniques__loop">Loop</span>
              {formatMmSs(remainingMs)}
            </p>
          }
        />
      ) : filled && src ? (
        <button type="button" className="techniques__slot techniques__slot--filled" aria-pressed={selected} onClick={onSelect}>
          <video className="techniques__thumb" src={src} muted playsInline preload="metadata" aria-label={card.title} />
        </button>
      ) : (
        <button
          type="button"
          className="techniques__slot"
          aria-pressed={selected}
          onClick={() => {
            onSelect();
            if (!card.locked) onAdd();
          }}
        >
          + Add video
        </button>
      )}
      {playing && filled && src ? null : dock}
      </div>
      {filled && !card.locked ? (
        <div className="techniques__slot-actions">
          <button type="button" className="btn" onClick={onAdd}>
            Replace
          </button>
          <button type="button" className="btn btn--ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : null}
      <p className="techniques__note">Loops for {formatMmSs(card.durationMs)}</p>
    </section>
  );
}

function SlotCard({
  slot,
  title,
  fromLesson = false,
  selected,
  playing,
  src,
  muted,
  unlockSound,
  canAdd,
  loopSec,
  remainingMs,
  customOpen,
  timersLocked,
  timedLoopMs,
  onSelect,
  onAdd,
  onRemove,
  onDrill,
  onCustom,
  onNudge,
  fullscreen,
  dock,
  onToggleFullscreen,
  onStop,
  onToggleMute,
  parts = 'all',
}: {
  slot: VideoSlot;
  title: string;
  fromLesson?: boolean;
  selected: boolean;
  playing: boolean;
  src?: string;
  muted: boolean;
  unlockSound: boolean;
  canAdd: boolean;
  /** Loop length shown on a technique card. The lesson duration, unless a manual length wins. */
  loopSec?: number;
  remainingMs?: number;
  customOpen?: boolean;
  timersLocked?: boolean;
  /** Warm-up and cool down opened from a class plan. Unset keeps the untimed loop. */
  timedLoopMs?: number;
  onSelect: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onDrill?: (seconds: number) => void;
  onCustom?: () => void;
  onNudge?: (delta: number) => void;
  fullscreen?: boolean;
  dock?: ReactNode;
  onToggleFullscreen?: () => void;
  onStop?: () => void;
  onToggleMute?: () => void;
  /** `player` is the focus stage. `controls` is the Details tab. `all` is the stacked card. */
  parts?: 'all' | 'player' | 'controls';
}) {
  const filled = Boolean(slot.clipId && src);
  const timed = isTimedSlot(slot);
  const lengthSec = loopSec ?? slot.drillSec;
  const showClock = playing && timed && remainingMs != null;
  const showTimedLoop = Boolean(playing && timedLoopMs && timedLoopMs > 0);
  const [timedLeft, setTimedLeft] = useState(timedLoopMs ?? 0);
  useEffect(() => {
    setTimedLeft(timedLoopMs ?? 0);
  }, [timedLoopMs, playing]);
  const cardClass = [
    'techniques__card',
    selected ? 'techniques__card--on' : '',
    fromLesson ? 'techniques__card--lesson' : '',
    playing ? 'techniques__card--playing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const stage = parts === 'player';
  const playerNode = (
      <div className="techniques__player" data-player="">
      {playing && filled && src ? (
        <LoopClip
          src={src}
          label={title}
          playing
          muted={muted}
          unlockSound={unlockSound}
          fullscreen={Boolean(fullscreen)}
          durationMs={showTimedLoop ? timedLoopMs : undefined}
          onDurationEnd={showTimedLoop ? onStop : undefined}
          onRemaining={showTimedLoop ? setTimedLeft : undefined}
          dock={stage ? undefined : dock}
          onToggleFullscreen={onToggleFullscreen}
          onStop={onStop}
          onToggleMute={onToggleMute}
          overlay={
            showClock ? (
              <p
                className={`techniques__clock${remainingMs === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
                aria-live="polite"
              >
                <span className="techniques__loop">Loop</span>
                {formatMmSs(remainingMs)}
              </p>
            ) : showTimedLoop ? (
              <p
                className={`techniques__clock${timedLeft === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
                aria-live="polite"
              >
                <span className="techniques__loop">Loop</span>
                {formatMmSs(timedLeft)}
              </p>
            ) : (
              <span className="techniques__live">Loop</span>
            )
          }
        />
      ) : filled && src ? (
        <button
          type="button"
          className="techniques__slot techniques__slot--filled"
          aria-pressed={selected}
          onClick={onSelect}
        >
          <video className="techniques__thumb" src={src} muted playsInline preload="metadata" aria-label={title} />
        </button>
      ) : (
        <button
          type="button"
          className={`techniques__slot${canAdd ? '' : ' techniques__slot--cap'}`}
          aria-pressed={selected}
          aria-disabled={!canAdd}
          title={canAdd ? undefined : 'Pick another card to add a clip'}
          onClick={() => {
            onSelect();
            if (canAdd) onAdd();
          }}
        >
          + Add video
        </button>
      )}
      {stage || (playing && filled && src) ? null : dock}
      </div>
  );
  const controlsNode = (
    <>
      {filled ? (
        <div className="techniques__slot-actions">
          <button type="button" className="btn" onClick={onAdd}>
            Replace
          </button>
          <button type="button" className="btn btn--ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : null}
      {timed && onDrill && onCustom && onNudge ? (
        <div
          className="presets presets--match-length techniques__presets"
          role="radiogroup"
          aria-label={`Loop timer for ${title}`}
        >
          {DRILL_PRESETS_SEC.map((seconds) => {
            const on = lengthSec === seconds && !customOpen;
            return (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={on}
                className={`preset${on ? ' preset--on' : ''}`}
                disabled={timersLocked}
                onClick={() => onDrill(seconds)}
              >
                {formatMss(seconds)}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={Boolean(customOpen)}
            className={`preset${customOpen ? ' preset--on' : ''}`}
            disabled={timersLocked}
            onClick={onCustom}
          >
            Custom
          </button>
          {customOpen ? (
            <div className="interval-stepper techniques__stepper" role="group" aria-label={`Custom loop timer for ${title}`}>
              <button
                type="button"
                className="clock-nudge"
                disabled={timersLocked || lengthSec <= MIN_DRILL_SEC}
                aria-label="Subtract 15 seconds"
                onClick={() => onNudge(-15)}
              >
                −
              </button>
              <strong aria-live="polite">{formatMss(lengthSec)}</strong>
              <button
                type="button"
                className="clock-nudge"
                disabled={timersLocked || lengthSec >= MAX_DRILL_SEC}
                aria-label="Add 15 seconds"
                onClick={() => onNudge(15)}
              >
                +
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
  if (parts === 'player') {
    return (
      <div className={`techniques__stage${playing ? ' techniques__card--playing' : ''}`} id={`techniques-slot-${slot.slotId}`}>
        {playerNode}
      </div>
    );
  }
  if (parts === 'controls') return <div className="techniques__controls">{controlsNode}</div>;
  return (
    <section
      id={`techniques-slot-${slot.slotId}`}
      className={cardClass}
      aria-labelledby={`techniques-heading-${slot.slotId}`}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, label')) return;
        onSelect();
      }}
    >
      <h2 id={`techniques-heading-${slot.slotId}`}>{title}</h2>
      {playerNode}
      {controlsNode}
    </section>
  );
}
