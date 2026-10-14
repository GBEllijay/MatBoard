/**
 * Friendly names and date folders for gym Drive videos.
 * The visible file name is for people. The stable clip id stays in
 * Drive appProperties and the file description.
 */

import { dateFromKey, localDateKey } from './trainingNotesStore.ts';

export const VIDEOS_FOLDER_NAME = 'Videos';
export const DRIVE_VIDEO_SHOW_LIMIT = 5;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FOLDER_NAME = /^(\d{4}-\d{2}-\d{2})(?: \((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\))?$/;

export function videoDateFolderName(dateKey: string): string {
  if (!DATE_KEY.test(dateKey)) return dateKey.trim();
  const weekday = WEEKDAYS[dateFromKey(dateKey).getDay()] ?? 'Day';
  return `${dateKey} (${weekday})`;
}

export function parseVideoDateFolderName(name: string): string | null {
  const match = name.trim().match(DATE_FOLDER_NAME);
  if (!match?.[1] || !isCalendarDate(match[1])) return null;
  return match[1];
}

export function dateInDriveVideoName(name: string): string | null {
  const match = name.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match?.[1] || !isCalendarDate(match[1])) return null;
  return match[1];
}

function isCalendarDate(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function localDayFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const key = localDateKey(date);
  return DATE_KEY.test(key) ? key : null;
}

/**
 * Date used to group a Drive video.
 * A date written in the file name wins. Otherwise the stored date, then
 * createdTime, then modifiedTime.
 */
export function driveVideoDateKey(file: {
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}): string | null {
  const fromName = dateInDriveVideoName(file.name);
  if (fromName) return fromName;
  const stamped = file.appProperties?.date?.trim() ?? '';
  if (isCalendarDate(stamped)) return stamped;
  return localDayFromIso(file.createdTime) ?? localDayFromIso(file.modifiedTime);
}

export function sanitizeDriveFilePart(value: string, max: number): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

function videoExtension(mime: string, originalName: string): string {
  const fromName = originalName.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? '';
  if (fromName && /^(mp4|webm|mov|m4v|ogg|ogv|mkv)$/.test(fromName)) return fromName;
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/ogg') return 'ogg';
  return 'mp4';
}

/**
 * `2026-10-13 GB1 Armbar from guard - clip 3.mp4`.
 * With no lesson title the title part is `Clip N`.
 * The clip id is not part of this name.
 */
export function friendlyTrainingVideoName(input: {
  dateKey: string;
  classDesignation?: string;
  lessonTitle?: string;
  clipNumber?: number;
  mime: string;
  originalName?: string;
}): string {
  const ext = videoExtension(input.mime, input.originalName ?? '');
  const clipNumber = Math.max(1, Math.floor(input.clipNumber || 1));
  const designation = sanitizeDriveFilePart(input.classDesignation ?? '', 40);
  const title = sanitizeDriveFilePart(input.lessonTitle ?? '', 80);
  const head = [input.dateKey, designation].filter(Boolean).join(' ');
  const body = title ? `${head} ${title} - clip ${clipNumber}` : `${head} Clip ${clipNumber}`;
  return `${body}.${ext}`.slice(0, 240);
}

/** Stable id kept beside the file, never in the visible name. */
export function driveClipDescription(localClipId: string): string {
  const id = localClipId.trim().slice(0, 120);
  return id ? `advantage-clip:${id}` : '';
}

export function renameDriveVideoName(currentName: string, edited: string): string {
  const ext = currentName.match(/(\.[a-z0-9]{2,5})$/i)?.[1] ?? '';
  let next = sanitizeDriveFilePart(edited, 180);
  if (!next) return currentName;
  if (ext && !next.toLowerCase().endsWith(ext.toLowerCase())) next = `${next}${ext}`;
  return next;
}

function titleFromFriendlyVideoName(name: string, classDesignation = ''): string | null {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  const dated = base.match(/^\d{4}-\d{2}-\d{2}\s+(.+)$/);
  if (!dated?.[1]) return null;
  const rest = dated[1].trim();
  const titled = rest.match(/^(.*?)\s+-\s+clip\s+(\d+)$/i);
  if (titled) {
    let title = titled[1].trim();
    const designation = classDesignation.trim();
    if (designation && title.toLowerCase().startsWith(`${designation.toLowerCase()} `)) {
      title = title.slice(designation.length).trim();
    }
    return title || null;
  }
  const clip = rest.match(/Clip\s+(\d+)$/i);
  if (clip?.[1]) return `Clip ${clip[1]}`;
  return null;
}

export function driveVideoShortLabel(
  file: { name: string; lessonTitle?: string; classDesignation?: string },
  clipNumber: number,
): string {
  const stored = file.lessonTitle?.trim() ?? '';
  if (stored) return stored;
  const parsed = titleFromFriendlyVideoName(file.name, file.classDesignation);
  if (parsed) return parsed;
  return `Clip ${Math.max(1, Math.floor(clipNumber) || 1)}`;
}

export function formatVideoClock(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatVideoDuration(millis: number | null | undefined): string {
  if (millis == null || !Number.isFinite(millis) || millis < 0) return '';
  const total = Math.round(millis / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatVideoSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function driveVideoMeasure(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export type DriveVideoPresentation = {
  id: string;
  /** Full Drive file name. Tooltip, detail, and download use this. */
  label: string;
  mime: string;
  shortLabel: string;
  timeLabel: string;
  /** Lesson title or Clip N, plus the clock time when Drive has one. */
  displayLabel: string;
  detailLabel: string;
  thumbnailLink: string | null;
};

export function presentDriveVideo(
  file: {
    id: string;
    name: string;
    mime: string;
    thumbnailLink?: string | null;
    createdTime?: string;
    size?: string | number | null;
    durationMillis?: string | number | null;
    lessonTitle?: string;
    classDesignation?: string;
  },
  clipNumber: number,
): DriveVideoPresentation {
  const shortLabel = driveVideoShortLabel(file, clipNumber);
  const timeLabel = formatVideoClock(file.createdTime);
  const duration = formatVideoDuration(driveVideoMeasure(file.durationMillis));
  const size = formatVideoSize(driveVideoMeasure(file.size));
  return {
    id: file.id,
    label: file.name,
    mime: file.mime || 'video/mp4',
    shortLabel,
    timeLabel,
    displayLabel: timeLabel ? `${shortLabel} · ${timeLabel}` : shortLabel,
    detailLabel: duration || size,
    thumbnailLink: file.thumbnailLink?.trim() || null,
  };
}

export function driveVideoCountLabel(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  return safe === 1 ? '1 video' : `${safe} videos`;
}

export function visibleDriveVideoCount(total: number, showAll: boolean, limit = DRIVE_VIDEO_SHOW_LIMIT): number {
  const safe = Math.max(0, Math.floor(total));
  if (showAll) return safe;
  return Math.min(safe, limit);
}
