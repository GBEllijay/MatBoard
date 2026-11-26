import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { FolderChevron } from '../components/FolderChevron';
import { MediaFolderTiles, type MediaTile } from '../components/MediaFolderTiles';
import { CloudVideoCleanup } from '../components/CloudVideoCleanup';
import { MediaConsoleMark } from '../components/MediaConsoleArt';
import { Chrome } from '../components/Chrome';
import { GymLogoControl } from '../components/GymLogoControl';
import { FaqLink } from '../components/FaqLink';
import { InstructionsButton } from '../components/InstructionsButton';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { ScheduleMonthBoard } from '../components/ScheduleMonthBoard';
import { ScheduleWeekBoard } from '../components/ScheduleWeekBoard';
import { EventCastSlide } from '../components/EventCastSlide';
import { ShopCastSlide } from '../components/ShopCastSlide';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { ToolboxFolder } from '../components/ToolboxFolder';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { Sheet } from '../components/Sheet';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { DriveMediaPicker } from '../components/DriveMediaPicker';
import { GooglePhotosPicker } from '../components/GooglePhotosPicker';
import { AdvantageCloudHome } from '../components/AdvantageCloudHome';
import { OpenMyDrive } from '../components/OpenMyDrive';
import { MediaSourceSheet } from '../components/VideoSourceSheet';
import { CameraWindow } from '../components/CameraWindow';
import { useEntitlementSettled } from '../hooks/useEntitlementSettled';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useScheduleState } from '../hooks/useStores';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import {
  DEFAULT_EVENTS_CAST_MODE,
  EVENTS_CAST_MODE_OPTIONS,
  type EventsCastMode,
} from '../lib/eventSlides';
import { mediaConsoleDriveActions, mediaConsoleGalleryLead } from '../lib/gymHome';
import { readGymLogo, subscribeGymLogo } from '../lib/gymLogo';
import { isProgramDirectorSeat, seatPermissionAllows } from '../lib/instructorSeats';
import { APPROVAL_WAITING } from '../lib/galleryApproval';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';
import { addClassPhotoPromotionFiles } from '../lib/classPhotoPromotions';
import { advantageCloudReady, gymActorForCloud, loadAdvantageCloudHome } from '../lib/advantageCloudMedia';
import { CAMERA_PARAM, cameraDailyVideosAllowed, cameraModeRequested, cameraPhotoAllowed } from '../lib/pdCamera';
import { readOneDriveBinding, readOneDriveSession } from '../lib/oneDrive';
import {
  DAILY_VIDEO_STAY,
  VIDEO_DESTINATION_DAILY,
  VIDEO_DESTINATION_DAILY_HINT,
  VIDEO_DESTINATION_GALLERY,
  VIDEO_DESTINATION_GALLERY_HINT,
  VIDEO_DESTINATION_LEGEND,
  canSendToDailyVideos,
  chooseDailyVideoHome,
  dailyVideoHomeLabel,
  probeDailyVideoCloud,
  sendToDailyVideos,
  type DailyVideoHome,
  type VideoDestination,
} from '../lib/dailyVideoDrop';
import { MEDIA_CONSOLE_INSTRUCTIONS, MEDIA_CONSOLE_NAME } from '../lib/productNames';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  PICK_FROM_DRIVE_LABEL,
  chunkDriveImport,
  driveImportChunkSize,
  driveImportOutcomeNote,
  driveImportProgressLabel,
  driveImportSaveErrorNote,
  drivePickEntry,
  runDriveImport,
  type DriveBrowseMedia,
  type DrivePickKind,
} from '../lib/driveMediaPicker';
import { formatMss, secondsToMs } from '../lib/format';
import { publishGymFile } from '../lib/gymPublish';
import { cloudCopyLine, copyFilesToCloudGallery } from '../lib/galleryCloudCopy';
import { cloudUploadQueue, galleryQueueInputs } from '../lib/cloudUploadQueueInstance';
import { CloudUploadQueuePanel } from '../components/CloudUploadQueuePanel';

/** Google Photos imports wait while this many Cloud uploads are unfinished. */
const PHOTOS_QUEUE_AHEAD = 24;
import { CloudGallerySection } from '../components/CloudGallerySection';
import { CloudEventsPanel } from '../components/CloudEventsPanel';
import { DeviceToCloudMigration } from '../components/DeviceToCloudMigration';
import { useCloudMediaFolders, useCloudRowUrls, useLeaveWarning } from '../hooks/useCloudMediaFolders';
import {
  CLOUD_VIDEO_DEVICE_ONLY,
  NETWORKED_FOLDERS,
  cloudFolderOfDevice,
  folderBackingNote,
  isCloudRow,
  folderCopyFor,
  mergeBackedRows,
  uniqueCloudFileName,
} from '../lib/cloudMediaFolders';
import { uploadToCloudFolder } from '../lib/advantageCloudFolders';
import { notifyCloudMedia } from '../lib/advantageCloudMedia';
import { shrinkPhotoForStore } from '../lib/imageShrink';
import { PlayingFromLine } from '../components/PlayingFromLine';
import { GALLERY_LINK_DONE, galleryItemShows, nextClassFromDays } from '../lib/gallerySchedule';
import { optionsReopenBlocked } from '../lib/optionsReopenGuard';
import { downloadDriveFile, getDriveBindingSnapshot, requestDriveToken, subscribeDriveBinding } from '../lib/googleDrive';
import {
  PHOTOS_PICK_LABEL,
  PHOTOS_SIGN_IN_AGAIN,
  downloadPhotosFile,
  getPhotosBindingSnapshot,
  photosImportProgressLabel,
  requestPhotosToken,
  subscribePhotosBinding,
  type PhotosPickKind,
  type PhotosPickedItem,
} from '../lib/googlePhotos';
import {
  PHOTO_PICKER_ACCEPT,
  VIDEO_CAPTURE,
  VIDEO_PICKER_ACCEPT,
  VIDEO_RECORD_ACCEPT,
  type MediaSourceKind,
} from '../lib/mediaPicker';
import {
  SMALLER_BATCH_TIP,
  folderPickFeedback,
  folderSaveProgressLabel,
} from '../lib/folderBatch';
import { LARGE_MEDIA_BYTES, LARGE_MEDIA_NOTE } from '../lib/storageQuota';
import {
  addDriveMediaFiles,
  addFolderFiles,
  clearFolder,
  clampIntervalSec,
  DEFAULT_FOLDER_PLAY,
  DEFAULT_INTERVAL_SEC,
  DEFAULT_MUTE_VIDEO,
  DEFAULT_SHUFFLE,
  FOLDERS,
  fileMatchesFolder,
  folderById,
  isAcceptedVideoFile,
  getSaverPrefs,
  INTERVAL_PRESETS_SEC,
  isFolderId,
  isVideoItem,
  listPhotos,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  playableItems,
  removePhoto,
  renamePhoto,
  reorderFolderItems,
  setFolderPlay,
  setEventsCastMode,
  setItemBuyUrl,
  linkTechniqueClipsToGallery,
  setGalleryDetails,
  setItemPlay,
  setItemQrLinks,
  setItemStartsSlide,
  setSaverIntervalSec,
  setSaverMuteVideo,
  setSaverShuffle,
  setShopCastMode,
  withFolderOrder,
  type FolderId,
  type StoredPhoto,
} from '../lib/photoStore';
import { itemsInFolder } from '../lib/playlist';
import { loadTechniqueBoard, readTrainingClipBlob } from '../lib/techniqueStore';
import { isWithinRetention, loadTrainingArchive, localDateKey, planHasContent, plansOnDay } from '../lib/trainingNotesStore';
import { insertScheduleCastSlide, scheduleCastDwellMs } from '../lib/scheduleCast';
import { setScheduleCastEnabled } from '../lib/scheduleStore';
import {
  buildCastSlides,
  DEFAULT_SHOP_CAST_MODE,
  SHOP_CAST_MODE_OPTIONS,
  type ShopCastMode,
} from '../lib/shopSlides';

export function ScreensaverPage() {
  const seat = useCurrentSeat();
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(false);
  const optionsClosedAtRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [shuffle, setShuffle] = useState(DEFAULT_SHUFFLE);
  const [muteVideo, setMuteVideo] = useState(DEFAULT_MUTE_VIDEO);
  const [pickerNote, setPickerNote] = useState('');
  const [batchStatus, setBatchStatus] = useState<BatchNotice | null>(null);
  /** Result of the Advantage Cloud copy for gallery picks. Null when Cloud is not in play. */
  const [cloudCopy, setCloudCopy] = useState<{ tone: 'saved' | 'error'; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<MediaSourceKind>('photo');
  const [videoDest, setVideoDest] = useState<VideoDestination>('gallery');
  const [dailyHome, setDailyHome] = useState<DailyVideoHome | null>(null);
  const [drivePickOpen, setDrivePickOpen] = useState(false);
  const [drivePickKind, setDrivePickKind] = useState<DrivePickKind>('photo');
  const [driveConnectOpen, setDriveConnectOpen] = useState(false);
  const [photosConnectOpen, setPhotosConnectOpen] = useState(false);
  const [photosPickOpen, setPhotosPickOpen] = useState(false);
  const [photosPickKind, setPhotosPickKind] = useState<PhotosPickKind>('photo');
  const driveBinding = useSyncExternalStore(subscribeDriveBinding, getDriveBindingSnapshot, () => null);
  const passSettled = useEntitlementSettled();
  const ownerCloud = useProPlusCloudUnlocked();
  const [licenseCloudReady, setLicenseCloudReady] = useState(false);
  useEffect(() => {
    if (!passSettled || ownerCloud) {
      setLicenseCloudReady(false);
      return;
    }
    let cancel = false;
    void loadAdvantageCloudHome().then((view) => {
      if (!cancel) setLicenseCloudReady(view.phase === 'ready');
    });
    return () => {
      cancel = true;
    };
  }, [passSettled, ownerCloud]);
  const cloudEntitled = ownerCloud || licenseCloudReady;
  const driveActions = mediaConsoleDriveActions({
    settled: passSettled,
    cloudEntitled,
    driveConnected: Boolean(driveBinding),
  });
  const cloudCustomer = passSettled && cloudEntitled;
  /** Gallery, Pro Shop, and Events show the gym's Advantage Cloud folders when this device is signed in to Cloud. */
  const cloudMedia = useCloudMediaFolders(cloudCustomer);
  const cloudBacked = cloudMedia.backing === 'cloud';
  /** Uploads this page started that have not finished. Leaving the page would stop them. */
  const [cloudSending, setCloudSending] = useState(false);
  const queuePending = useSyncExternalStore(
    cloudUploadQueue.subscribe,
    () => cloudUploadQueue.pendingCount() > 0,
    () => false,
  );
  useLeaveWarning(cloudSending || queuePending);
  const photosBinding = useSyncExternalStore(subscribePhotosBinding, getPhotosBindingSnapshot, () => null);
  useEffect(() => {
    if (photosBinding) setPhotosConnectOpen(false);
  }, [photosBinding]);
  const photosPopupRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!driveConnectOpen || !driveBinding) return;
    setDriveConnectOpen(false);
    setDrivePickOpen(true);
  }, [driveConnectOpen, driveBinding]);
  const [unlockSound, setUnlockSound] = useState(false);
  const [folderPlay, setFolderPlayState] = useState(DEFAULT_FOLDER_PLAY);
  const [shopCastMode, setShopCastModeState] = useState<ShopCastMode>(DEFAULT_SHOP_CAST_MODE);
  const [eventsCastMode, setEventsCastModeState] = useState<EventsCastMode>(DEFAULT_EVENTS_CAST_MODE);
  const [gymLogoUrl, setGymLogoUrl] = useState<string | null>(() => readGymLogo());
  const [openSection, setOpenSection] = useState<FolderId | 'schedule' | null>(null);
  /** The photo open in the Media screen viewer, so its full picture loads even past the first 40. */
  const [viewingId, setViewingId] = useState<string | null>(null);
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const videoRecordRef = useRef<HTMLInputElement>(null);
  const videoLibraryRef = useRef<HTMLInputElement>(null);
  const addFolderRef = useRef<FolderId>('gallery');
  const savingRef = useRef(false);
  const intervalMs = secondsToMs(intervalSec);
  const [searchParams] = useSearchParams();
  // Program director Camera window: a view of this page, so it reuses the add sheet below.
  const cameraMode = cameraModeRequested(searchParams.get(CAMERA_PARAM), seat);
  const fs = usePlayFullscreen(cameraMode ? { auto: false } : undefined);
  const navigate = useNavigate();
  const back = useSubmenuBack() ?? '/pro';
  const folderParam = searchParams.get('folder');
  const requestedFolder =
    folderParam === 'videos' ? 'gallery' : isFolderId(folderParam) ? folderParam : null;

  useEffect(() => {
    if (!requestedFolder) return;
    setOptions(true);
    addFolderRef.current = requestedFolder;
  }, [requestedFolder]);

  const focusFolder = requestedFolder ?? 'gallery';
  const focusConfig = folderById(focusFolder);
  const schedule = useScheduleState();
  const todayKey = localDateKey();
  const nextClass = useMemo(() => {
    const archive = loadTrainingArchive(todayKey);
    const dates = Object.keys(archive.days).filter(
      (dateKey) => isWithinRetention(dateKey, todayKey) && plansOnDay(archive, dateKey).some(planHasContent),
    );
    return nextClassFromDays(dates, todayKey);
  }, [todayKey]);
  const mediaRows = useMemo(
    () => mergeBackedRows({ backing: cloudMedia.backing, deviceRows: photos, cloudRows: cloudMedia.rows }),
    [cloudMedia.backing, cloudMedia.rows, photos],
  );
  const queue = useMemo(
    () => playableItems(mediaRows, folderPlay).filter((item) => galleryItemShows(item, todayKey, nextClass)),
    [mediaRows, folderPlay, todayKey, nextClass],
  );
  const shopList = useMemo(() => itemsInFolder(mediaRows, 'shop'), [mediaRows]);
  const slides = useMemo(
    () =>
      insertScheduleCastSlide(
        buildCastSlides(queue, shopList),
        schedule.castEnabled && schedule.classes.length > 0,
      ),
    [queue, shopList, schedule.castEnabled, schedule.classes.length],
  );

  useVisibleViewportHeight();
  useWakeLock(!cameraMode && playing && slides.length > 0);

  const refresh = async () => {
    const rows = await listPhotos();
    setPhotos(rows);
  };

  useEffect(() => {
    void refresh();
    void getSaverPrefs().then((prefs) => {
      setIntervalSec(prefs.intervalSec);
      setFolderPlayState(prefs.folderPlay);
      setShuffle(prefs.shuffle);
      setMuteVideo(prefs.muteVideo);
      setShopCastModeState(prefs.shopCastMode);
      setEventsCastModeState(prefs.eventsCastMode);
    });
  }, []);

  useEffect(() => {
    if (options) return;
    setGymLogoUrl(readGymLogo());
    return subscribeGymLogo(() => setGymLogoUrl(readGymLogo()));
  }, [options]);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const photoIdsKey = photos
    .map((photo) => `${photo.id}:${photo.techniqueClipId}:${photo.loopSec}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const photo of photosRef.current) {
        let blob = photo.blob;
        if (photo.techniqueClipId) {
          const linked = await readTrainingClipBlob(photo.techniqueClipId);
          if (linked) blob = linked;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        next[photo.id] = url;
      }
      if (cancelled) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setUrlById(next);
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoIdsKey]);

  useEffect(() => {
    setIndex(0);
  }, [folderPlay, shuffle]);

  const order = useMemo(() => {
    const ids = slides.map((_, i) => i);
    if (!shuffle) return ids;
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }, [slides, shuffle]);

  useEffect(() => {
    setIndex((n) => (order.length === 0 ? 0 : n % order.length));
  }, [order.length]);

  const currentSlide = slides[order[index] ?? 0];
  /** Cloud rows: read the slide on screen, the next two, and the open folder's list. */
  const wantedCloudIds = useMemo(() => {
    const ids: string[] = [];
    const push = (row: StoredPhoto | undefined) => {
      if (row?.cloudPath && !ids.includes(row.id)) ids.push(row.id);
    };
    for (let step = 0; step < 3 && order.length; step += 1) {
      const slide = slides[order[(index + step) % order.length] ?? 0];
      if (slide?.kind === 'media') push(slide.item);
      else if (slide?.kind === 'shop') slide.items.forEach(push);
    }
    if (options && openSection && openSection !== 'schedule') itemsInFolder(mediaRows, openSection).slice(0, 40).forEach(push);
    if (options && viewingId) push(mediaRows.find((row) => row.id === viewingId));
    return ids;
  }, [slides, order, index, options, openSection, mediaRows, viewingId]);
  const cloudUrls = useCloudRowUrls(cloudMedia.rows, wantedCloudIds);
  const srcById = useMemo(() => ({ ...urlById, ...cloudUrls }), [urlById, cloudUrls]);
  const currentPhoto = currentSlide?.kind === 'media' ? currentSlide.item : undefined;
  const showEventCast = Boolean(
    currentPhoto &&
      currentPhoto.folderId === 'events' &&
      eventsCastMode !== 'images' &&
      (eventsCastMode === 'images-qr-logo' || currentPhoto.qrLinks.length > 0),
  );
  const current = currentPhoto ? srcById[currentPhoto.id] : undefined;
  const currentIsVideo = Boolean(currentPhoto && isVideoItem(currentPhoto));

  const advance = useCallback(() => {
    setIndex((n) => (order.length === 0 ? 0 : (n + 1) % order.length));
  }, [order.length]);

  useEffect(() => {
    if (!playing || !currentSlide || currentIsVideo) return;
    if (order.length <= 1) return;
    const dwell = currentSlide.kind === 'schedule' ? scheduleCastDwellMs(intervalMs) : intervalMs;
    const id = window.setTimeout(advance, dwell);
    return () => window.clearTimeout(id);
  }, [playing, currentSlide, currentIsVideo, order.length, intervalMs, advance, index]);

  useEffect(() => {
    const loopSec = currentPhoto?.loopSec ?? 0;
    if (!playing || loopSec <= 0 || order.length <= 1) return;
    const id = window.setTimeout(advance, loopSec * 1000);
    return () => window.clearTimeout(id);
  }, [playing, currentPhoto, order.length, advance, index]);

  const commitInterval = (next: number) => {
    const clamped = clampIntervalSec(next);
    setIntervalSec(clamped);
    void setSaverIntervalSec(clamped);
  };

  const commitFolderPlay = (folderId: FolderId, enabled: boolean) => {
    setFolderPlayState((prev) => ({ ...prev, [folderId]: enabled }));
    void setFolderPlay(folderId, enabled);
  };

  const persistFolderOrder = async (folderId: FolderId, orderedIds: string[]) => {
    const cloudIds = orderedIds.filter((id) => mediaRows.some((row) => row.id === id && isCloudRow(row)));
    const deviceIds = orderedIds.filter((id) => !cloudIds.includes(id));
    if (cloudIds.length) await cloudMedia.reorder(folderId, cloudIds);
    if (!deviceIds.length) return;
    setPhotos((rows) => withFolderOrder(rows, folderId, deviceIds));
    try {
      await reorderFolderItems(folderId, deviceIds);
    } catch {
      await refresh();
    }
  };

  /** One item edit: Cloud rows save to Advantage Cloud for every device, device rows stay here. */
  const editItem = async (
    folderId: FolderId,
    id: string,
    fields: Partial<StoredPhoto>,
    onDevice: () => Promise<void>,
  ) => {
    const row = mediaRows.find((item) => item.id === id);
    if (row && isCloudRow(row)) {
      await cloudMedia.update(folderId, id, fields);
      return;
    }
    setPhotos((rows) => rows.map((item) => (item.id === id ? { ...item, ...fields } : item)));
    try {
      await onDevice();
    } catch (error) {
      setBatchStatus({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'That change did not save on this device.' });
      await refresh();
    }
  };

  const commitShuffle = (next: boolean) => {
    setShuffle(next);
    void setSaverShuffle(next);
  };

  const commitMuteVideo = (next: boolean) => {
    setMuteVideo(next);
    void setSaverMuteVideo(next);
    if (!next) setUnlockSound(true);
  };

  const commitShopCastMode = (next: ShopCastMode) => {
    setShopCastModeState(next);
    void setShopCastMode(next);
  };

  const commitEventsCastMode = (next: EventsCastMode) => {
    setEventsCastModeState(next);
    void setEventsCastMode(next);
  };

  const dailyVideoSeat = canSendToDailyVideos(seat);

  const openAdd = (folderId: FolderId, kind: MediaSourceKind) => {
    addFolderRef.current = folderId;
    setAddKind(kind);
    setVideoDest('gallery');
    setAddOpen(true);
    if (kind === 'video' && folderId === 'gallery' && dailyVideoSeat) {
      // Only offer today's videos where the gym can hold them. Cloud asks the server.
      const local = { driveConnected: Boolean(driveBinding), oneDriveConnected: Boolean(readOneDriveBinding() && readOneDriveSession()) };
      setDailyHome(chooseDailyVideoHome({ cloudDrop: false, ...local }));
      void probeDailyVideoCloud().then((cloudDrop) => {
        setDailyHome(chooseDailyVideoHome({ cloudDrop, ...local }));
      });
    } else {
      setDailyHome(null);
    }
  };

  /** Camera window video: Gallery or Today's videos, the same sheet and choice as Add videos. */
  const openCameraVideo = () => {
    openAdd('gallery', 'video');
    if (!cameraPhotoAllowed(seat)) setVideoDest('daily-videos');
  };
  const cameraGalleryChoice = !cameraMode || cameraPhotoAllowed(seat);

  const dailyChoiceShown = addKind === 'video' && addFolderRef.current === 'gallery' && dailyVideoSeat && dailyHome !== null;
  const sendingDaily = dailyChoiceShown && videoDest === 'daily-videos';

  const onDailyFiles = async (files: readonly File[], home: DailyVideoHome) => {
    savingRef.current = true;
    setPickerNote('');
    setBatchStatus({ tone: 'progress', text: `Sending to today's videos in ${dailyVideoHomeLabel(home)}…` });
    try {
      const result = await sendToDailyVideos({
        files,
        dateKey: localDateKey(),
        home,
        role: gymActorForCloud('seat', seat?.presetId ?? null),
        onProgress: (done, total) => {
          if (total > 1 && done < total) {
            setBatchStatus({ tone: 'progress', text: `Sending ${done + 1} of ${total} to today's videos…` });
          }
        },
      });
      if (result.sent) {
        setBatchStatus({ tone: 'saved', text: 'Sent' });
        setPickerNote(result.message);
      } else {
        showBatchError('gallery', result.message);
      }
    } finally {
      savingRef.current = false;
    }
  };

  const openDrivePick = (folderId: FolderId, kind: DrivePickKind) => {
    addFolderRef.current = folderId;
    setDrivePickKind(kind);
    setAddKind(kind === 'video' ? 'video' : 'photo');
    setAddOpen(false);
    if (drivePickEntry(Boolean(driveBinding)) === 'connect') {
      setDriveConnectOpen(true);
      return;
    }
    setDrivePickOpen(true);
  };

  const closePhotosPick = () => {
    photosPopupRef.current?.close();
    photosPopupRef.current = null;
    setPhotosPickOpen(false);
  };

  const openPhotosPick = (folderId: FolderId, kind: PhotosPickKind) => {
    addFolderRef.current = folderId;
    setPhotosPickKind(kind);
    setAddKind(kind === 'video' ? 'video' : 'photo');
    setAddOpen(false);
    if (!photosBinding) {
      setPhotosConnectOpen(true);
      return;
    }
    photosPopupRef.current?.close();
    photosPopupRef.current = window.open('about:blank', 'advantage-google-photos', 'popup,width=480,height=800');
    setPhotosPickOpen(true);
  };

  const importFromPhotos = async (chosen: readonly PhotosPickedItem[]) => {
    if (savingRef.current) return;
    const folderId = addFolderRef.current;
    const picked = [...chosen];
    closePhotosPick();
    if (!picked.length) return;
    savingRef.current = true;
    setPickerNote('');
    setBatchStatus({ tone: 'progress', text: photosImportProgressLabel(0, picked.length) });
    try {
      const token = (await requestPhotosToken('silent')) ?? (await requestPhotosToken('consent'));
      if (!token) {
        showBatchError(folderId, PHOTOS_SIGN_IN_AGAIN);
        return;
      }
      // Up to 2000 picks: open, save, and queue a few at a time so the phone never holds the whole batch.
      const cloudOn = folderId === 'gallery' && (await advantageCloudReady());
      const chunkSize = picked.some((item) => item.kind === 'video') ? 3 : 8;
      let opened = 0;
      let added = 0;
      let cursor = 0;
      for (const chunk of chunkDriveImport(picked, chunkSize)) {
        const files: { file: File; driveFileId: string }[] = [];
        for (const item of chunk) {
          setBatchStatus({ tone: 'progress', text: photosImportProgressLabel(cursor, picked.length) });
          cursor += 1;
          if (!item || !item.videoReady) continue;
          try {
            const blob = await downloadPhotosFile(token, item);
            const type = item.mime || blob.type || 'application/octet-stream';
            files.push({
              file: new File([blob], item.name || 'Google Photos file', { type }),
              driveFileId: item.id,
            });
          } catch {
            /* One file can fail. The rest still import. */
          }
        }
        if (!files.length) continue;
        opened += files.length;
        if (cloudBacked && NETWORKED_FOLDERS.includes(folderId)) {
          added += await sendFilesToCloud(folderId, files.map((row) => row.file));
          if (folderId === 'gallery') await cloudUploadQueue.whenBelow(PHOTOS_QUEUE_AHEAD);
          continue;
        }
        added += await addDriveMediaFiles(files, folderId, {
          onProgress: (progress) => {
            setBatchStatus({ tone: 'progress', text: folderSaveProgressLabel(progress) });
          },
        });
        if (cloudOn) {
          setCloudCopy(null);
          cloudUploadQueue.add(galleryQueueInputs(files.map((row) => row.file), localDateKey()));
          // Let the queue drain a little before opening more files.
          await cloudUploadQueue.whenBelow(PHOTOS_QUEUE_AHEAD);
        }
      }
      if (!opened) {
        showBatchError(folderId, 'Those Google Photos files could not be opened. Nothing was saved.');
        return;
      }
      if (!added && !cloudOn) {
        showBatchError(folderId, 'Those files are already in this folder, or this folder does not use that kind.');
        return;
      }
      setBatchStatus(null);
      setPickerNote('');
      await refresh();
      setPlaying(true);
      setOpenSection(folderId);
      setOptions(true);
    } catch (error) {
      showBatchError(
        folderId,
        error instanceof Error ? error.message : 'Those Google Photos files could not be saved.',
      );
      try {
        await refresh();
      } catch {
        /* The note is the signal. */
      }
    } finally {
      savingRef.current = false;
    }
  };

  const importFromDrive = async (chosen: readonly DriveBrowseMedia[]) => {
    if (savingRef.current) return;
    const folderId = addFolderRef.current;
    const picked = [...chosen];
    setDrivePickOpen(false);
    if (!picked.length) return;
    savingRef.current = true;
    setPickerNote('');
    setBatchStatus({ tone: 'progress', text: driveImportProgressLabel(0, picked.length) });
    try {
      const token = (await requestDriveToken('silent')) ?? (await requestDriveToken('consent'));
      if (!token) {
        showBatchError(folderId, 'Sign in to Google Drive again to pick those files.');
        return;
      }
      const driveSaved: File[] = [];
      const result = await runDriveImport({
        items: picked,
        chunkSize: driveImportChunkSize(drivePickKind),
        download: async (item) => {
          const blob = await downloadDriveFile(token, item.id);
          const type = item.mime || blob.type || 'application/octet-stream';
          return {
            file: new File([blob], item.name || 'Drive file', { type }),
            driveFileId: item.id,
          };
        },
        save: async (files, report) => {
          if (cloudBacked && NETWORKED_FOLDERS.includes(folderId)) return sendFilesToCloud(folderId, files.map((row) => row.file));
          const added = await addDriveMediaFiles([...files], folderId, { onProgress: report });
          if (folderId === 'gallery' && added) driveSaved.push(...files.map((row) => row.file));
          return added;
        },
        onLabel: (text) => setBatchStatus({ tone: 'progress', text }),
      });
      if (!result.ok) {
        showBatchError(
          folderId,
          driveImportSaveErrorNote(result.error, result.outcome.added, result.outcome.picked),
        );
        if (result.outcome.added > 0) {
          await refresh();
          setPlaying(true);
          setOpenSection(folderId);
          setOptions(true);
        } else {
          try {
            await refresh();
          } catch {
            /* The note is the signal. */
          }
        }
        return;
      }
      if (driveSaved.length) await copyGalleryToCloud(driveSaved, true);
      const note = driveImportOutcomeNote(result.outcome);
      if (note) {
        showBatchError(folderId, note);
        if (result.outcome.added > 0) {
          await refresh();
          setPlaying(true);
          setOpenSection(folderId);
          setOptions(true);
        }
        return;
      }
      setBatchStatus(null);
      setPickerNote('');
      await refresh();
      setPlaying(true);
      setOpenSection(folderId);
      setOptions(true);
    } catch (error) {
      showBatchError(
        folderId,
        error instanceof Error ? error.message : 'Those Google Drive files could not be saved.',
      );
      try {
        await refresh();
      } catch {
        /* The note is the signal. */
      }
    } finally {
      savingRef.current = false;
    }
  };

  const scrollPickerNote = useCallback((node: HTMLParagraphElement | null) => {
    if (!node || !pickerNote) return;
    node.scrollIntoView({ block: 'nearest' });
  }, [pickerNote]);

  const showBatchError = (folderId: FolderId, text: string) => {
    setPickerNote('');
    setBatchStatus({ tone: 'error', text });
    setOpenSection(folderId);
    setOptions(true);
  };

  /**
   * Copy gallery picks to Advantage Cloud and say what happened.
   * With Cloud on, files join the upload queue (per-file progress, retry,
   * cancel, skip what is already uploaded) and this returns right away.
   * Without Cloud, Drive or OneDrive copies run exactly as before.
   */
  const copyGalleryToCloud = async (files: readonly File[], cloudOnly: boolean) => {
    if (!files.length) return;
    if (await advantageCloudReady()) {
      setCloudCopy(null);
      cloudUploadQueue.add(galleryQueueInputs(files, localDateKey()));
      return;
    }
    const summary = await copyFilesToCloudGallery(files, { dateKey: localDateKey(), cloudOnly });
    setCloudCopy(summary ? cloudCopyLine(summary) : null);
  };

  /**
   * Cloud-backed folders: picks go to the matching Advantage Cloud folder, not this device.
   * Gallery photos join the upload queue (progress, retry, cancel). Gallery videos stay on
   * this device and are never sent to Cloud from here. Pro Shop and Events photos are
   * shrunk like device cards and sent one at a time with a default name.
   * Returns how many files were saved or queued.
   */
  const sendFilesToCloud = async (folderId: FolderId, files: readonly File[]): Promise<number> => {
    const folder = folderById(folderId);
    const dateKey = localDateKey();
    if (folderId === 'gallery') {
      const videos = files.filter((file) => isAcceptedVideoFile(file));
      const pictures = files.filter((file) => !isAcceptedVideoFile(file) && fileMatchesFolder(file, folder));
      let saved = 0;
      if (videos.length) {
        saved += await addFolderFiles([...videos], 'gallery');
        setPickerNote(CLOUD_VIDEO_DEVICE_ONLY);
        await refresh();
      }
      if (pictures.length) {
        setCloudCopy(null);
        cloudUploadQueue.add(galleryQueueInputs(pictures, dateKey));
        saved += pictures.length;
      }
      return saved;
    }
    const pictures = files.filter((file) => fileMatchesFolder(file, folder));
    if (!pictures.length) return 0;
    const cloudFolder = cloudFolderOfDevice(folderId);
    if (cloudFolder === 'gallery') return 0;
    const existing = itemsInFolder(mediaRows, folderId).filter((row) => isCloudRow(row));
    let nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const failures: string[] = [];
    let sent = 0;
    let waiting = 0;
    let repeats = 0;
    setCloudSending(true);
    try {
      for (const [i, file] of pictures.entries()) {
        setBatchStatus({ tone: 'progress', text: `Sending ${i + 1} of ${pictures.length} to Advantage Cloud ${folder.label}… Keep this page open.` });
        let blob: Blob = file;
        try {
          blob = await shrinkPhotoForStore(file);
        } catch {
          /* Send the original when it cannot be shrunk. */
        }
        const mime = blob.type.startsWith('image/') ? blob.type : file.type || 'image/jpeg';
        const named = new File([blob], uniqueCloudFileName(file.name || folder.labelPrefix, mime), { type: mime });
        const result = await uploadToCloudFolder({ folder: cloudFolder, file: named, dateKey });
        if (!result.ok) {
          failures.push(result.message);
          continue;
        }
        if (result.duplicate) {
          repeats += 1;
          continue;
        }
        if (result.lane === 'pending') {
          waiting += 1;
          continue;
        }
        sent += 1;
        nextOrder += 1;
        if (cloudMedia.canEdit(folderId)) {
          const saved = await cloudMedia.patch(folderId, {
            items: { [result.path]: { label: `${folder.labelPrefix} ${existing.length + sent}`, sortOrder: nextOrder, playEnabled: true } },
          });
          if (!saved.ok) failures.push(saved.message);
        }
      }
    } finally {
      setCloudSending(false);
    }
    notifyCloudMedia();
    await cloudMedia.reload();
    if (failures.length) {
      showBatchError(
        folderId,
        `${sent ? `Sent ${sent} to Advantage Cloud ${folder.label}. ` : ''}${failures.length} did not send: ${failures[0]}`,
      );
    } else if (waiting) {
      setBatchStatus({ tone: 'saved', text: 'Waiting' });
      setPickerNote(`${APPROVAL_WAITING} They show in ${folder.label} after the owner approves them.`);
    } else if (sent) {
      setBatchStatus({ tone: 'saved', text: 'Saved to Advantage Cloud' });
      if (repeats) setPickerNote(`${repeats} already in ${folder.label}, skipped.`);
    } else if (repeats) {
      setBatchStatus({ tone: 'saved', text: `Already in ${folder.label}` });
    }
    return sent + waiting;
  };

  const onFiles = async (files: readonly File[]) => {
    if (savingRef.current) return;
    const kind = addKind;
    const folderId = addFolderRef.current;
    if (sendingDaily && dailyHome && folderId === 'gallery') {
      setAddOpen(false);
      await onDailyFiles([...files], dailyHome);
      return;
    }
    if (!cameraGalleryChoice && folderId === 'gallery') {
      // Camera window with the Gallery switch off: only today's videos may take this file.
      setAddOpen(false);
      setBatchStatus({ tone: 'error', text: "Nothing was saved. Today's videos is not set up for this gym yet." });
      return;
    }
    const folder = folderById(folderId);
    const picked = [...files];
    const readable = picked.filter((file) => file.size > 0);
    const matched = readable.filter((file) => fileMatchesFolder(file, folder));
    setAddOpen(false);

    if (!readable.length) {
      showBatchError(folderId, folderPickFeedback({
        picked: picked.length,
        readable: 0,
        matched: 0,
        added: 0,
        kind,
        error: null,
      }) ?? `Nothing was saved. ${SMALLER_BATCH_TIP}`);
      return;
    }

    if (!matched.length) {
      showBatchError(
        folderId,
        folderPickFeedback({
          picked: picked.length,
          readable: readable.length,
          matched: 0,
          added: 0,
          kind,
          error: null,
        }) ?? `Nothing was saved. ${SMALLER_BATCH_TIP}`,
      );
      return;
    }

    // Program director with the gallery approval switch on: the same pending
    // lane as Today's class photo / promotions. It plays after an approver says yes.
    if (
      folderId === 'gallery' &&
      isProgramDirectorSeat(seat) &&
      readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage).required
    ) {
      savingRef.current = true;
      setPickerNote('');
      setBatchStatus({ tone: 'progress', text: 'Sending for approval…' });
      try {
        const result = await addClassPhotoPromotionFiles(localDateKey(), matched);
        if (result.saved) {
          setBatchStatus({ tone: 'saved', text: 'Waiting' });
          setPickerNote(`${APPROVAL_WAITING} They play in the Gallery after they are approved.`);
        } else {
          showBatchError(folderId, `Nothing was saved. ${SMALLER_BATCH_TIP}`);
        }
      } catch (error) {
        showBatchError(folderId, error instanceof Error ? error.message : `Nothing was saved. ${SMALLER_BATCH_TIP}`);
      } finally {
        savingRef.current = false;
      }
      return;
    }

    if (cloudBacked && NETWORKED_FOLDERS.includes(folderId)) {
      savingRef.current = true;
      setPickerNote('');
      try {
        const sent = await sendFilesToCloud(folderId, matched);
        if (sent) setPlaying(true);
      } catch (error) {
        showBatchError(folderId, error instanceof Error ? error.message : 'Those files did not send to Advantage Cloud.');
      } finally {
        savingRef.current = false;
      }
      return;
    }

    savingRef.current = true;
    setPickerNote('');
    setBatchStatus({
      tone: 'progress',
      text: folderSaveProgressLabel({ done: 0, total: matched.length, phase: 'shrink' }),
    });
    try {
      const added = await addFolderFiles(readable, folderId, {
        onProgress: (progress) => {
          setBatchStatus({ tone: 'progress', text: folderSaveProgressLabel(progress) });
        },
      });
      const feedback = folderPickFeedback({
        picked: picked.length,
        readable: readable.length,
        matched: matched.length,
        added,
        kind,
        error: null,
      });
      const large = picked.some((file) => file.size >= LARGE_MEDIA_BYTES);
      if (feedback) {
        showBatchError(folderId, feedback);
      } else if (added) {
        setBatchStatus({ tone: 'saved', text: 'Saved' });
        setPickerNote(large ? LARGE_MEDIA_NOTE : '');
      } else {
        setBatchStatus(null);
        setPickerNote('');
      }
      if (added) {
        const purpose = folderId === 'gallery' ? 'gallery' : folderId === 'shop' ? 'pro-shop' : folderId === 'events' ? 'events' : '';
        if (purpose === 'gallery') {
          await copyGalleryToCloud(matched, false);
        } else if (purpose) {
          const dateKey = localDateKey();
          const failed: string[] = [];
          for (const file of matched) {
            const published = await publishGymFile({
              purpose,
              role: 'owner',
              kind: file.type.startsWith('video/') ? 'video' : 'photo',
              dateKey,
              fileName: file.name || (purpose === 'pro-shop' ? 'product-card' : 'photo'),
              bytes: file,
              mime: file.type || (file.type.startsWith('video/') ? 'video/mp4' : 'image/jpeg'),
            }).catch((error: unknown) => ({ failed: true, message: error instanceof Error ? error.message : '' }));
            if (published.failed) failed.push(published.message || 'The gym folder did not answer.');
          }
          // Saved here either way. Say so when the gym-folder copy did not go, instead of hiding it.
          setCloudCopy(
            failed.length
              ? { tone: 'error', text: `Saved on this device. ${failed.length} of ${matched.length} did not copy to the gym folder: ${failed[0]}` }
              : null,
          );
        }
      }
      await refresh();
      if (added) setPlaying(true);
    } catch (error) {
      const added = savedCount(error);
      showBatchError(
        folderId,
        folderPickFeedback({
          picked: picked.length,
          readable: readable.length,
          matched: matched.length,
          added,
          kind,
          error,
        }) ?? `Could not save these files. Nothing was saved. ${SMALLER_BATCH_TIP}`,
      );
      try {
        await refresh();
      } catch {
        /* The note is the signal. A second storage failure should not hide it. */
      }
    } finally {
      savingRef.current = false;
    }
  };

  const exitSlideshow = () => {
    void fs.exit().finally(() => {
      navigate(back);
    });
  };

  const hubTitle = MEDIA_CONSOLE_NAME;
  const showBelt = options || !currentSlide;
  const galleryPage = focusFolder === 'gallery';
  // Gallery scrolls the purple belt with the list. Events and Pro Shop keep the pinned belt.
  const beltInSheet = showBelt && galleryPage && options;
  const beltHeader = (
    <div className={galleryPage ? 'saver-belt saver-belt--flow' : 'saver-belt'}>
      <BeltHeader kind="purple" title="Advantage - Media Console" />
    </div>
  );

  const focusEmpty = itemsInFolder(mediaRows, focusFolder).length === 0;
  const focusCanUpload =
    !seat ||
    (focusFolder === 'shop'
      ? seatPermissionAllows(seat.permissions, 'proShopAccess')
      : focusFolder === 'events'
        ? seatPermissionAllows(seat.permissions, 'eventsAccess')
        : seatPermissionAllows(seat.permissions, 'galleryUpload'));
  const emptyCopy =
    mediaRows.length === 0
      ? focusFolder === 'gallery'
        ? mediaConsoleGalleryLead({ cloudEntitled: cloudCustomer, driveConnected: Boolean(driveBinding) })
        : `${focusConfig.emptyCopy} Press F for fullscreen on a computer plugged into the TV.`
      : focusFolder === 'shop'
        ? 'Nothing is set to play. Turn on Pro Shop in options, then tap a left preview so at least one card is On.'
        : focusFolder === 'events'
          ? 'Nothing is set to play. Turn on Events in options, then tap a left preview so at least one photo is On.'
          : 'Nothing is set to play. Turn on Gallery in options, then tap a left preview so at least one photo or video is On.';

  const visibleFolders = FOLDERS.filter((folder) => {
    if (!seat) return true;
    if (folder.id === 'shop') return seatPermissionAllows(seat.permissions, 'proShopAccess');
    if (folder.id === 'events') return seatPermissionAllows(seat.permissions, 'eventsAccess');
    if (folder.id === 'gallery') return seatPermissionAllows(seat.permissions, 'galleryUpload');
    return true;
  });
  // The class schedule sat under Gallery before; it keeps the same seat rule.
  const scheduleVisible = visibleFolders.some((folder) => folder.id === 'gallery');
  const mediaTiles: MediaTile[] = [
    ...visibleFolders.map((folder): MediaTile => ({
      id: folder.id,
      label: folder.label,
      count: cloudMedia.checking ? null : itemsInFolder(mediaRows, folder.id).length,
      noun: folder.itemNoun,
      nounPlural: folder.itemNounPlural,
      playOn: folderPlay[folder.id],
      onPlay: (next) => commitFolderPlay(folder.id, next),
      addLabel: folder.addLabel,
      onAdd: folder.ready ? () => openAdd(folder.id, 'photo') : undefined,
    })),
    ...(scheduleVisible
      ? [
          {
            id: 'schedule' as const,
            label: 'Schedule',
            count: schedule.classes.length,
            noun: 'class',
            nounPlural: 'classes',
            playOn: schedule.castEnabled,
            onPlay: (next: boolean) => setScheduleCastEnabled(next),
            addLabel: 'Add classes',
            addHref: '/schedule',
          },
        ]
      : []),
  ];
  // Gallery first, then Schedule, Pro Shop, Events: the order the TV plays them.
  mediaTiles.sort((a, b) => MEDIA_TILE_ORDER.indexOf(a.id) - MEDIA_TILE_ORDER.indexOf(b.id));

  const addSheets = (
    <>
      <MediaSourceSheet
        open={addOpen}
        kind={addKind}
        title={addKind === 'video' ? 'Add videos' : folderById(addFolderRef.current).addLabel}
        captureInputId={addKind === 'video' ? 'saver-video-record' : 'saver-photo-capture'}
        libraryInputId={addKind === 'video' ? 'saver-video-library' : 'saver-photo-library'}
        stacked={options && !cameraMode}
        stay={sendingDaily ? DAILY_VIDEO_STAY : undefined}
        onPickPhotos={sendingDaily ? undefined : () => openPhotosPick(addFolderRef.current, addKind === 'video' ? 'video' : 'photo')}
        onPickDrive={
          sendingDaily || (!driveActions.connect && !driveActions.importExisting)
            ? undefined
            : () => openDrivePick(addFolderRef.current, addKind === 'video' ? 'video' : 'photo')
        }
        onClose={() => setAddOpen(false)}
      >
        {dailyChoiceShown && dailyHome ? (
          <fieldset className="cloud-media__choice" data-video-destination="">
            <legend>{VIDEO_DESTINATION_LEGEND}</legend>
            {cameraGalleryChoice ? (
            <label>
              <input
                type="radio"
                name="saver-video-destination"
                value="gallery"
                checked={videoDest === 'gallery'}
                onChange={() => setVideoDest('gallery')}
              />
              <span>
                <strong>{VIDEO_DESTINATION_GALLERY}</strong> {VIDEO_DESTINATION_GALLERY_HINT}
              </span>
            </label>
            ) : null}
            <label>
              <input
                type="radio"
                name="saver-video-destination"
                value="daily-videos"
                checked={videoDest === 'daily-videos'}
                onChange={() => setVideoDest('daily-videos')}
              />
              <span>
                <strong>{VIDEO_DESTINATION_DAILY}</strong> {VIDEO_DESTINATION_DAILY_HINT} Saved in {dailyVideoHomeLabel(dailyHome)}.
              </span>
            </label>
          </fieldset>
        ) : null}
      </MediaSourceSheet>
      <GooglePhotosPicker
        open={photosPickOpen}
        kind={photosPickKind}
        stacked={options && !cameraMode}
        getPopup={() => photosPopupRef.current}
        onClose={closePhotosPick}
        onDone={(files) => {
          void importFromPhotos(files);
        }}
      />
      <DriveMediaPicker
        open={drivePickOpen}
        kind={drivePickKind}
        stacked={options && !cameraMode}
        onClose={() => setDrivePickOpen(false)}
        onDone={(files) => {
          void importFromDrive(files);
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
      <Sheet
        open={photosConnectOpen && !photosBinding}
        title="Connect with"
        onClose={() => setPhotosConnectOpen(false)}
        stacked
      >
        <DriveConnectCard />
      </Sheet>
      <DeviceMediaInput
        id="saver-photo-capture"
        inputRef={photoCaptureRef}
        accept={PHOTO_PICKER_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-photo-library"
        inputRef={photoLibraryRef}
        accept={PHOTO_PICKER_ACCEPT}
        multiple
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-video-record"
        inputRef={videoRecordRef}
        accept={VIDEO_RECORD_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-video-library"
        inputRef={videoLibraryRef}
        accept={VIDEO_PICKER_ACCEPT}
        multiple
        onFiles={onFiles}
      />
    </>
  );

  if (cameraMode) {
    return (
      <main className={`saver saver--belt saver--camera${fs.className ? ` ${fs.className}` : ''}`}>
        <PlayExitMark to={back} onExit={exitSlideshow} />
        <CameraWindow
          photoAllowed={cameraPhotoAllowed(seat)}
          dailyAllowed={cameraDailyVideosAllowed(seat)}
          dateKey={todayKey}
          statusText={batchStatus ? batchStatus.text : ''}
          note={pickerNote}
          muted={muteVideo}
          fs={fs}
          onTakePhoto={() => openAdd('gallery', 'photo')}
          onTakeVideo={openCameraVideo}
          onToggleMute={() => commitMuteVideo(!muteVideo)}
        />
        {addSheets}
      </main>
    );
  }

  return (
    <main
      className={`saver${currentSlide ? ' saver--play' : ''}${showBelt ? ' saver--belt' : ''}${showBelt && galleryPage ? ' saver--gallery' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .chrome, .saver__empty, .btn, input, label, .play-fs, .play-exit, .tier-home, .tv-tip, .saver__unmute, .saver-batch, .week-cast.is-drift, .week-cast.is-paused, .month-cast.is-drift, .month-cast.is-paused')) return;
        if (optionsReopenBlocked(optionsClosedAtRef.current, Date.now())) return;
        if (!muteVideo) setUnlockSound(true);
        if (slides.length) setOptions(true);
      }}
    >
      <Chrome ghost />
      {!options && batchStatus ? (
        <BatchStatus status={batchStatus} onDismiss={() => setBatchStatus(null)} />
      ) : null}
      <PlayExitMark to={back} onExit={exitSlideshow} />
      {showBelt ? <MediaConsoleMark /> : null}
      {showBelt && !beltInSheet ? beltHeader : null}
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          shortcut={fs.tvStation}
          onToggle={() => void fs.toggle()}
        />
      </div>
      <TvTip onFullscreen={() => void fs.enter()} />
      {currentSlide?.kind === 'schedule' ? (
        schedule.template === 'monthly' ? (
          <ScheduleMonthBoard variant="cast" onOpenOptions={() => setOptions(true)} />
        ) : (
          <ScheduleWeekBoard variant="cast" onOpenOptions={() => setOptions(true)} />
        )
      ) : currentSlide?.kind === 'shop' ? (
        <ShopCastSlide
          key={currentSlide.items.map((item) => `${item.id}:${item.buyUrl}`).join('|')}
          items={currentSlide.items}
          srcById={srcById}
          mode={shopCastMode}
          logoUrl={gymLogoUrl}
        />
      ) : showEventCast && current && currentPhoto ? (
        <EventCastSlide
          key={`${currentPhoto.id}:${currentPhoto.qrLinks.join('|')}:${eventsCastMode}`}
          item={currentPhoto}
          src={current}
          mode={eventsCastMode}
          logoUrl={gymLogoUrl}
        />
      ) : currentPhoto?.cloudPath && !current ? (
        <div className="saver__frame" role="status" aria-label="Opening from Advantage Cloud">
          <p className="saver-caption">Opening from Advantage Cloud…</p>
        </div>
      ) : current && currentPhoto ? (
        <SaverSlide
          key={currentPhoto.id}
          item={currentPhoto}
          src={current}
          altFrame={index % 2 === 1}
          playing={playing}
          loop={order.length <= 1 || (currentPhoto.loopSec ?? 0) > 0}
          muted={muteVideo}
          unlockSound={unlockSound}
          onEnded={advance}
        />
      ) : (
        <div className="saver__empty" onClick={(e) => e.stopPropagation()}>
          <h1>{hubTitle}</h1>
          <PlayingFromLine cloudBacked={cloudBacked} />
          <p>{emptyCopy}</p>
          {cloudCustomer ? <AdvantageCloudHome showQueue={!options} /> : null}
          {galleryPage && cloudCopy ? (
            <p className={`saver-cloud-copy${cloudCopy.tone === 'error' ? ' saver-cloud-copy--error' : ''}`} data-cloud-copy={cloudCopy.tone}>
              {cloudCopy.text}
            </p>
          ) : null}
          {galleryPage && !options && !cloudCustomer ? <CloudUploadQueuePanel /> : null}
          {galleryPage && !options ? <CloudGallerySection onCopyFromDrive={() => openDrivePick('gallery', 'any')} driveConnected={Boolean(driveBinding)} /> : null}
          {focusConfig.ready && focusEmpty && focusCanUpload ? (
            <>
              <button type="button" className="btn" onClick={() => openAdd(focusFolder, 'photo')}>
                {focusConfig.addLabel}
              </button>
              {focusConfig.videoAddLabel ? (
                <button type="button" className="btn" onClick={() => openAdd(focusFolder, 'video')}>
                  {focusConfig.videoAddLabel}
                </button>
              ) : null}
              <p className="saver-sound-hint">Optional import. Copies files onto this device. Does not replace Advantage Cloud or disconnect a folder.</p>
              <button
                type="button"
                className="btn"
                onClick={() => openPhotosPick(focusFolder, focusFolder === 'gallery' ? 'any' : 'photo')}
              >
                {PHOTOS_PICK_LABEL}
              </button>
              {driveActions.connect || driveActions.importExisting ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => openDrivePick(focusFolder, focusFolder === 'gallery' ? 'any' : 'photo')}
                >
                  {cloudCustomer ? 'Import from Google Drive' : PICK_FROM_DRIVE_LABEL}
                </button>
              ) : null}
              {driveActions.connect || driveActions.importExisting ? <OpenMyDrive /> : null}
            </>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={() => setOptions(true)}>
            Options
          </button>
        </div>
      )}

      <Sheet
        className="sheet--dock-footer"
        open={options}
        title={hubTitle}
        onClose={() => {
          optionsClosedAtRef.current = Date.now();
          if (!muteVideo) setUnlockSound(true);
          setOptions(false);
        }}
        footer={
          <>
          <InstructionsButton controlsId="media-console-instructions" align="stretch">
            <ul>
              {MEDIA_CONSOLE_INSTRUCTIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </InstructionsButton>
          <FaqLink />
          </>
        }
      >
        {beltInSheet ? beltHeader : null}
        <PlayingFromLine cloudBacked={cloudBacked} />
        {options && batchStatus ? (
          <BatchStatus panel status={batchStatus} onDismiss={() => setBatchStatus(null)} />
        ) : null}
        <label className="toggle saver-playing">
          <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />
          Playing
        </label>
        {pickerNote ? (
          <p className="saver-folder__empty" role="status" ref={scrollPickerNote}>
            {pickerNote}
          </p>
        ) : null}
        {cloudCopy ? (
          <p
            className={`saver-cloud-copy${cloudCopy.tone === 'error' ? ' saver-cloud-copy--error' : ''}`}
            role={cloudCopy.tone === 'error' ? 'alert' : 'status'}
            data-cloud-copy={cloudCopy.tone}
          >
            {cloudCopy.text}
          </p>
        ) : null}
        <CloudUploadQueuePanel />
        {cloudBacked ? (
          <DeviceToCloudMigration
            deviceRows={photos}
            snapshots={cloudMedia.snapshots}
            patch={cloudMedia.patch}
            onDone={async () => {
              notifyCloudMedia();
              await cloudMedia.reload();
            }}
          />
        ) : null}
        {cloudMedia.checking ? <p className="saver-folder__empty" role="status">Checking Advantage Cloud…</p> : null}
        {!cloudBacked && cloudCustomer && cloudMedia.error ? (
          <p className="saver-cloud-copy saver-cloud-copy--error" role="alert">
            {cloudMedia.error} Showing what is saved on this device.
          </p>
        ) : null}

        {openSection === null ? <MediaFolderTiles tiles={mediaTiles} onOpen={(id) => setOpenSection(id)} /> : null}
        <div className="saver-folders">
          {visibleFolders.filter((folder) => openSection === folder.id).map((folder) => {
            const galleryUpload =
              folder.id !== 'gallery' || !seat || seatPermissionAllows(seat.permissions, 'galleryUpload');
            return (
            <Fragment key={folder.id}>
            <ToolboxFolder
              bare
              onBack={() => setOpenSection(null)}
              onViewing={setViewingId}
              folder={folderCopyFor(folder, cloudMedia.backing)}
              open={openSection === folder.id}
              playEnabled={folderPlay[folder.id]}
              items={itemsInFolder(mediaRows, folder.id)}
              thumbById={srcById}
              notice={[
                folderBackingNote({ backing: cloudMedia.backing, cloudEntitled: cloudCustomer }),
                cloudBacked && cloudMedia.error ? cloudMedia.error : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onToggle={(next) => {
                setOpenSection((current) => {
                  if (next) return folder.id;
                  return current === folder.id ? null : current;
                });
              }}
              onPlayToggle={commitFolderPlay}
              onAdd={folder.ready && galleryUpload ? () => openAdd(folder.id, 'photo') : undefined}
              onAddVideo={
                folder.ready && galleryUpload && folder.videoAddLabel
                  ? () => openAdd(folder.id, 'video')
                  : undefined
              }
              onPickPhotos={
                folder.ready && galleryUpload
                  ? () => openPhotosPick(folder.id, folder.id === 'gallery' ? 'any' : 'photo')
                  : undefined
              }
              onPickDrive={
                folder.ready && galleryUpload && (driveActions.connect || driveActions.importExisting)
                  ? () => openDrivePick(folder.id, folder.id === 'gallery' ? 'any' : 'photo')
                  : undefined
              }
              onClear={
                folder.ready && !cloudBacked
                  ? async () => {
                      await clearFolder(folder.id);
                      await refresh();
                      setOptions(true);
                    }
                  : undefined
              }
              onRename={async (id, label) => editItem(folder.id, id, { label }, () => renamePhoto(id, label))}
              onRemove={async (id) => {
                const row = mediaRows.find((item) => item.id === id);
                if (row && isCloudRow(row)) {
                  if (!cloudMedia.canDelete(folder.id)) {
                    setBatchStatus({ tone: 'error', text: 'Only the owner or an Instructors seat can delete from Advantage Cloud.' });
                    return;
                  }
                  // A Cloud delete removes it from every device, so ask first.
                  if (typeof window !== 'undefined' && !window.confirm('Delete this from Advantage Cloud for every device? This cannot be undone.')) return;
                  await cloudMedia.remove(folder.id, id);
                  return;
                }
                try {
                  await removePhoto(id);
                } catch (error) {
                  setBatchStatus({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'That item could not be removed.' });
                }
                await refresh();
              }}
              onItemPlayToggle={async (id, enabled) => editItem(folder.id, id, { playEnabled: enabled }, () => setItemPlay(id, enabled))}
              onReorder={async (orderedIds) => persistFolderOrder(folder.id, orderedIds)}
              onBuyUrl={
                folder.id === 'shop'
                  ? async (id, buyUrl) => editItem(folder.id, id, { buyUrl }, () => setItemBuyUrl(id, buyUrl))
                  : undefined
              }
              onStartsSlide={
                folder.id === 'shop'
                  ? async (id, startsSlide) => editItem(folder.id, id, { startsSlide }, () => setItemStartsSlide(id, startsSlide))
                  : undefined
              }
              onQrLinks={
                folder.id === 'events'
                  ? async (id, qrLinks) => editItem(folder.id, id, { qrLinks }, () => setItemQrLinks(id, qrLinks))
                  : undefined
              }
              onGalleryChange={
                folder.id === 'gallery'
                  ? async (id, patch) => editItem(folder.id, id, patch, () => setGalleryDetails(id, patch))
                  : undefined
              }
              onLinkTechniques={
                folder.id === 'gallery'
                  ? () => {
                      void (async () => {
                        const board = await loadTechniqueBoard();
                        const clips = board.plan.slots.flatMap((slot) => {
                          if (!slot.clipId) return [];
                          const clip = board.clips.find((item) => item.id === slot.clipId);
                          return [
                            {
                              clipId: slot.clipId,
                              label: slot.mediaName || clip?.label || 'Technique clip',
                              mime: clip?.mime || slot.mediaMime || 'video/mp4',
                              loopSec: slot.drillSec,
                            },
                          ];
                        });
                        const added = await linkTechniqueClipsToGallery(clips);
                        await refresh();
                        setPickerNote(
                          added
                            ? GALLERY_LINK_DONE
                            : 'Those technique clips are already linked, or this day has no clips.',
                        );
                      })();
                    }
                  : undefined
              }
            >
              {folder.id === 'events' && cloudBacked && cloudMedia.snapshots.events ? (
                <details className="saver-folder media-folder__group" data-media-group-events="">
                  <summary className="saver-folder__summary">
                    <FolderChevron />
                    <span className="saver-folder__title">{GROUP_INTO_EVENT}</span>
                  </summary>
                  <div className="saver-folder__panel">
                    <p className="saver-folder__empty">{GROUP_INTO_EVENT_HINT}</p>
                    <CloudEventsPanel
                      tiles={itemsInFolder(mediaRows, 'events')
                        .filter((row) => row.cloudPath)
                        .map((row) => ({ path: row.cloudPath!, label: row.label, thumb: srcById[row.id] }))}
                      events={cloudMedia.snapshots.events.index.events}
                      canEdit={cloudMedia.canEdit('events')}
                      onPatch={(patch) => cloudMedia.patch('events', patch)}
                    />
                  </div>
                </details>
              ) : null}
              {folder.id === 'gallery' && cloudBacked && cloudMedia.canDelete('gallery') ? <CloudVideoCleanup /> : null}
            </ToolboxFolder>
            </Fragment>
            );
          })}
          {openSection === 'schedule' && scheduleVisible ? <ClassScheduleEntry bare onBack={() => setOpenSection(null)} open onToggle={() => undefined} /> : null}
        </div>
        {galleryPage && !cloudBacked ? <CloudGallerySection onCopyFromDrive={() => openDrivePick('gallery', 'any')} driveConnected={Boolean(driveBinding)} /> : null}

        <section className="saver-settings">
          <h3 className="saver-settings__title">Settings</h3>
        <fieldset>
          <legend>Photo interval</legend>
          <div className="interval-stepper" role="group" aria-label="Photo interval">
            <button
              type="button"
              className="clock-nudge"
              disabled={intervalSec <= MIN_INTERVAL_SEC}
              aria-label="Subtract one second"
              onClick={() => commitInterval(intervalSec - 1)}
            >
              −
            </button>
            <strong aria-live="polite">{formatMss(intervalSec)}</strong>
            <button
              type="button"
              className="clock-nudge"
              disabled={intervalSec >= MAX_INTERVAL_SEC}
              aria-label="Add one second"
              onClick={() => commitInterval(intervalSec + 1)}
            >
              +
            </button>
          </div>
          <div className="presets" role="group" aria-label="Photo interval presets">
            {INTERVAL_PRESETS_SEC.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={`preset${intervalSec === seconds ? ' preset--on' : ''}`}
                onClick={() => commitInterval(seconds)}
              >
                {seconds === 60 ? '1:00' : `${seconds}s`}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Play order</legend>
          <div className="presets presets--split" role="radiogroup" aria-label="Play order">
            <button
              type="button"
              role="radio"
              aria-checked={!shuffle}
              className={`preset${!shuffle ? ' preset--on' : ''}`}
              onClick={() => commitShuffle(false)}
            >
              In order
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={shuffle}
              className={`preset${shuffle ? ' preset--on' : ''}`}
              onClick={() => commitShuffle(true)}
            >
              Shuffle
            </button>
          </div>
        </fieldset>
        {!seat || seatPermissionAllows(seat.permissions, 'proShopAccess') ? (
        <fieldset>
          <legend>Pro Shop on the TV</legend>
          <div className="presets presets--shop" role="radiogroup" aria-label="Pro Shop on the TV">
            {SHOP_CAST_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={shopCastMode === option.id}
                className={`preset${shopCastMode === option.id ? ' preset--on' : ''}`}
                onClick={() => commitShopCastMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="saver-sound-hint">
            Each card on a slide gets its own QR from its buy link. Logo uses the custom gym logo
            saved on this screen. The QR stays to the right of its photo. With the logo on, the gym
            mark stays on the left and the codes stay on the right. On a wide TV they share the
            black band above the photos.
          </p>
        </fieldset>
        ) : null}
        {!seat || seatPermissionAllows(seat.permissions, 'eventsAccess') ? (
        <fieldset>
          <legend>Events on the TV</legend>
          <div className="presets presets--shop" role="radiogroup" aria-label="Events on the TV">
            {EVENTS_CAST_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={eventsCastMode === option.id}
                className={`preset${eventsCastMode === option.id ? ' preset--on' : ''}`}
                onClick={() => commitEventsCastMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="saver-sound-hint">
            Each event photo can show several QR codes from its links. Codes stay to the right of
            the gym logo. On a phone they sit beside the photo. On a wide TV they share the black
            band above the photo.
          </p>
        </fieldset>
        ) : null}
        <fieldset>
          <legend>Video sound</legend>
          <p className="saver-sound-hint">
            Mute clips so gym-floor music keeps playing. Match and Training buzzers still cut
            through — they are separate from clip audio.
          </p>
          <div className="presets presets--split" role="radiogroup" aria-label="Video sound">
            <button
              type="button"
              role="radio"
              aria-checked={muteVideo}
              className={`preset${muteVideo ? ' preset--on' : ''}`}
              onClick={() => commitMuteVideo(true)}
            >
              Mute clips
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!muteVideo}
              className={`preset${!muteVideo ? ' preset--on' : ''}`}
              onClick={() => commitMuteVideo(false)}
            >
              Play video sound
            </button>
          </div>
        </fieldset>
        </section>
        <GymLogoControl />
      </Sheet>

      {addSheets}
    </main>
  );
}

type BatchNotice = { tone: 'progress' | 'error' | 'saved'; text: string };

function savedCount(error: unknown): number {
  if (error && typeof error === 'object' && 'saved' in error && typeof error.saved === 'number') {
    return error.saved;
  }
  return 0;
}

function BatchStatus({
  status,
  panel = false,
  onDismiss,
}: {
  status: BatchNotice;
  panel?: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`saver-batch${panel ? ' saver-batch--panel' : ''}${status.tone === 'error' ? ' saver-batch--error' : ''}`}
      role={status.tone === 'error' ? 'alert' : 'status'}
      aria-live={status.tone === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <p>{status.text}</p>
      {status.tone === 'error' ? (
        <button type="button" className="saver-batch__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

const MEDIA_TILE_ORDER = ['gallery', 'schedule', 'shop', 'events'];
export const GROUP_INTO_EVENT = 'Group into an event (optional)';
export const GROUP_INTO_EVENT_HINT = 'Photos you do not group still play on their own.';
export const SCHEDULE_FOLDER_NOTE =
  'The TV schedule slide comes from your class schedule. Schedule photos and PDFs uploaded to Advantage Cloud never reached the TV, so that upload folder is no longer shown here.';

function ClassScheduleEntry({ open, onToggle, bare, onBack }: { open: boolean; onToggle: (next: boolean) => void; bare?: boolean; onBack?: () => void }) {
  const schedule = useScheduleState();
  const ready = schedule.classes.length > 0;
  if (bare) {
    return (
      <section className="cloud-folder media-folder" data-media-folder="schedule">
        <div className="cloud-folder__bar">
          <button type="button" className="btn btn--ghost" data-media-folder-back="" onClick={onBack}>
            ‹ All folders
          </button>
          <h3>Schedule</h3>
          <label className="toggle media-tile__play">
            <input type="checkbox" role="switch" checked={schedule.castEnabled} aria-label="Play Schedule on TV" onChange={(event) => setScheduleCastEnabled(event.target.checked)} />
            Play on TV
          </label>
        </div>
        <Link className="btn" to="/schedule">
          {ready ? 'Edit class schedule' : 'Add class schedule'}
        </Link>
        <p className="saver-folder__empty">
          {ready
            ? `${schedule.classes.length} ${schedule.classes.length === 1 ? 'class' : 'classes'}. On adds the full week or month after Gallery and before Pro Shop.`
            : 'Add classes on the schedule page, then turn Play on TV on to show the week board.'}
        </p>
        <p className="saver-folder__empty">{SCHEDULE_FOLDER_NOTE}</p>
      </section>
    );
  }
  return (
    <details
      className="saver-folder"
      open={open}
      onToggle={(event) => {
        onToggle(event.currentTarget.open);
      }}
    >
      <summary className="saver-folder__summary">
        <FolderChevron />
        <span className="saver-folder__title">Class Schedule</span>
        <button
          type="button"
          className={`preset saver-folder__play${schedule.castEnabled ? ' preset--on' : ''}`}
          aria-pressed={schedule.castEnabled}
          aria-label="Play Class Schedule"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setScheduleCastEnabled(!schedule.castEnabled);
          }}
        >
          {schedule.castEnabled ? 'On' : 'Off'}
        </button>
      </summary>
      <div className="saver-folder__panel">
        <Link className="btn" to="/schedule">
          Add class schedule
        </Link>
        <div className="presets presets--split" role="radiogroup" aria-label="Class Schedule on the TV">
          <button
            type="button"
            role="radio"
            aria-checked={schedule.castEnabled}
            className={`preset${schedule.castEnabled ? ' preset--on' : ''}`}
            onClick={() => setScheduleCastEnabled(true)}
          >
            On the TV
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!schedule.castEnabled}
            className={`preset${!schedule.castEnabled ? ' preset--on' : ''}`}
            onClick={() => setScheduleCastEnabled(false)}
          >
            Off the TV
          </button>
        </div>
        <p className="saver-folder__empty">
          {ready
            ? 'On adds the full week or month after Gallery and before Pro Shop. Off keeps Gallery, Pro Shop, and Events.'
            : 'Add classes on the schedule page, then turn this on to play the week board in the cast.'}
        </p>
      </div>
    </details>
  );
}

function SaverSlide({
  item,
  src,
  altFrame,
  playing,
  loop,
  muted,
  unlockSound,
  onEnded,
}: {
  item: StoredPhoto;
  src: string;
  altFrame: boolean;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  unlockSound: boolean;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const video = isVideoItem(item);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    el.loop = loop;
    el.defaultMuted = muted;
    el.muted = muted;
    if (muted) setNeedsUnmute(false);
    if (!playing) {
      el.pause();
      return;
    }
    let cancelled = false;
    const start = async () => {
      try {
        el.muted = muted;
        if (!muted && unlockSound) el.muted = false;
        await el.play();
        if (cancelled) return;
        if (muted) {
          setNeedsUnmute(false);
          try {
            if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
          } catch {
            /* ignore */
          }
        } else if (!el.muted) {
          setNeedsUnmute(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        el.muted = true;
        if (!muted) setNeedsUnmute(true);
        try {
          await el.play();
        } catch {
          if (!cancelled && !loop) onEnded();
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      el.pause();
    };
  }, [playing, src, video, loop, onEnded, muted, unlockSound]);

  if (video) {
    return (
      <div className="saver__frame saver__frame--video">
        <video
          ref={videoRef}
          className="saver__video"
          src={src}
          muted={muted}
          playsInline
          autoPlay
          loop={loop}
          disableRemotePlayback
          onEnded={() => {
            if (!loop) onEnded();
          }}
          onError={() => {
            if (!loop) onEnded();
          }}
        />
        {item.caption ? <p className="saver-caption">{item.caption}</p> : null}
        {!muted && needsUnmute ? (
          <button
            type="button"
            className="saver__unmute"
            onClick={(event) => {
              event.stopPropagation();
              const el = videoRef.current;
              if (!el) return;
              el.muted = false;
              setNeedsUnmute(false);
              void el.play();
            }}
          >
            Tap for sound
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`saver__frame${altFrame ? ' saver__frame--alt' : ''}`}>
      <img className="saver__fill" src={src} alt="" aria-hidden="true" />
      <img className="saver__img" src={src} alt="" />
      {item.caption ? <p className="saver-caption">{item.caption}</p> : null}
    </div>
  );
}
