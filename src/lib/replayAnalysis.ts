/**
 * Video replay analysis: a movable lesson-plan card that holds one clip,
 * either recorded on this device or picked from the gallery (for example a
 * tournament video the coach filmed). The plan stores text and a reference
 * only. The clip bytes stay on this device (IndexedDB, replayClipStore.ts)
 * until the coach saves a copy through Advantage Cloud, Google Drive, or
 * OneDrive (replaySave.ts). Nothing here touches unlock codes or OAuth.
 *
 * The player math (double-tap ±10s, drag scrubbing) and the markup state
 * (circle, arrow, pen, undo, clear) live here so they can be unit tested
 * without a browser.
 */

import { clampText } from './plainValue.ts';

export const MAX_REPLAYS = 10;
export const REPLAY_TITLE_MAX = 120;
export const REPLAY_NOTES_MAX = 2000;
export const REPLAY_NAME_MAX = 160;
export const REPLAY_HEADING = 'Video replay analysis';
export const ADD_REPLAY_LABEL = 'Add video replay analysis section';

export type ReplaySaveKind = 'advantage-cloud' | 'google-drive' | 'onedrive';
export const REPLAY_SAVE_KINDS: readonly ReplaySaveKind[] = ['advantage-cloud', 'google-drive', 'onedrive'];

export type ReplayClipRef = {
  /** Key in this device's replay clip store. */
  localId: string;
  name: string;
  mime: string;
  size: number;
  source: 'record' | 'gallery';
  /** Set once a copy was saved off this device. */
  saved?: { kind: ReplaySaveKind; ref: string };
};

export type ReplayBlock = {
  id: string;
  title: string;
  notes: string;
  clip?: ReplayClipRef;
};

let seq = 0;
export function createReplayId(prefix = 'replay'): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${rand}`;
}

export function createReplay(): ReplayBlock {
  return { id: createReplayId(), title: '', notes: '' };
}

export function replayHasContent(replay: ReplayBlock): boolean {
  return Boolean(replay.title.trim() || replay.notes.trim() || replay.clip);
}

export function replayHeading(ordinal: number): string {
  return ordinal <= 1 ? REPLAY_HEADING : `${REPLAY_HEADING} ${ordinal}`;
}

export function cleanClip(value: unknown): { clip: ReplayClipRef | undefined; repaired: boolean } {
  if (value == null) return { clip: undefined, repaired: false };
  const raw = typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const localId = raw && typeof raw.localId === 'string' ? raw.localId.trim().slice(0, 80) : '';
  if (!raw || !localId) return { clip: undefined, repaired: true };
  const name = clampText(raw.name, REPLAY_NAME_MAX);
  const mime = typeof raw.mime === 'string' && /^video\/[\w.+-]+/.test(raw.mime) ? raw.mime.slice(0, 80) : 'video/mp4';
  const size = typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0 ? Math.floor(raw.size) : 0;
  const source = raw.source === 'record' ? 'record' : 'gallery';
  const clip: ReplayClipRef = { localId, name, mime, size, source };
  const savedRaw = raw.saved && typeof raw.saved === 'object' ? (raw.saved as Record<string, unknown>) : null;
  let repaired = raw.localId !== localId || raw.name !== name || raw.mime !== mime || raw.size !== size || raw.source !== source;
  if (savedRaw) {
    const kind = savedRaw.kind;
    const ref = typeof savedRaw.ref === 'string' ? savedRaw.ref.slice(0, 400) : '';
    if ((REPLAY_SAVE_KINDS as readonly unknown[]).includes(kind) && ref) clip.saved = { kind: kind as ReplaySaveKind, ref };
    else repaired = true;
  } else if (raw.saved !== undefined) repaired = true;
  return { clip, repaired };
}

export function cleanReplay(value: unknown): { replay: ReplayBlock; repaired: boolean } | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!raw) return null;
  const idValue = typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idValue ? idValue.slice(0, 80) : createReplayId();
  const title = clampText(raw.title, REPLAY_TITLE_MAX);
  const notes = clampText(raw.notes, REPLAY_NOTES_MAX);
  const { clip, repaired: clipRepaired } = cleanClip(raw.clip);
  const replay: ReplayBlock = { id, title, notes };
  if (clip) replay.clip = clip;
  return {
    replay,
    repaired: clipRepaired || !idValue || raw.id !== id || raw.title !== title || raw.notes !== notes,
  };
}

/** Copy for Drive/Cloud plan JSON. Text and the clip reference only, never bytes. */
export function replayForDrive(replay: ReplayBlock): ReplayBlock {
  const next: ReplayBlock = { id: replay.id, title: replay.title, notes: replay.notes };
  if (replay.clip) {
    next.clip = {
      localId: replay.clip.localId,
      name: replay.clip.name,
      mime: replay.clip.mime,
      size: replay.clip.size,
      source: replay.clip.source,
      ...(replay.clip.saved ? { saved: { ...replay.clip.saved } } : {}),
    };
  }
  return next;
}

/* ---------- Player math ---------- */

export const SEEK_STEP_SECONDS = 10;
/** Two taps inside this window on the same side count as a double tap. */
export const DOUBLE_TAP_MS = 300;

/** Clamp a target time into the clip. Unknown duration still never goes below 0. */
export function clampTime(time: number, duration: number): number {
  const t = Number.isFinite(time) ? time : 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, t);
  return Math.min(Math.max(0, t), duration);
}

/** YouTube-style skip of `step` seconds, clamped to the clip. */
export function seekBy(current: number, direction: -1 | 1, duration: number, step = SEEK_STEP_SECONDS): number {
  return clampTime(current + direction * step, duration);
}

/** Left 40% skips back, right 40% skips forward, the middle toggles nothing (0). */
export function tapZone(x: number, width: number): -1 | 0 | 1 {
  if (!(width > 0)) return 0;
  const ratio = x / width;
  if (ratio < 0.4) return -1;
  if (ratio > 0.6) return 1;
  return 0;
}

/** Pointer x on the scrub bar to a clip time. */
export function scrubTime(clientX: number, left: number, width: number, duration: number): number {
  if (!(width > 0) || !Number.isFinite(duration) || duration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return ratio * duration;
}

/** Keyboard on the scrub slider: arrows step 5s, Page keys step 10s, Home/End jump. */
export function scrubKey(key: string, current: number, duration: number): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampTime(current - 5, duration);
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampTime(current + 5, duration);
  if (key === 'PageDown') return seekBy(current, -1, duration);
  if (key === 'PageUp') return seekBy(current, 1, duration);
  if (key === 'Home') return 0;
  if (key === 'End') return clampTime(duration, duration);
  return null;
}

export function formatClock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Double-tap detector state, kept pure so the rule is testable. */
export type TapMemory = { at: number; zone: -1 | 0 | 1 } | null;

export function registerTap(
  memory: TapMemory,
  zone: -1 | 0 | 1,
  now: number,
  windowMs = DOUBLE_TAP_MS,
): { memory: TapMemory; seek: -1 | 0 | 1 } {
  if (zone === 0) return { memory: null, seek: 0 };
  if (memory && memory.zone === zone && now - memory.at <= windowMs) {
    // Keep the chain open so a third quick tap skips again.
    return { memory: { at: now, zone }, seek: zone };
  }
  return { memory: { at: now, zone }, seek: 0 };
}

/* ---------- Markup ---------- */

export type MarkupTool = 'circle' | 'arrow' | 'pen';
export const MARKUP_TOOLS: readonly MarkupTool[] = ['circle', 'arrow', 'pen'];
export const MARKUP_TOOL_LABELS: Record<MarkupTool, string> = { circle: 'Circle', arrow: 'Arrow', pen: 'Pen' };
export const MARKUP_COLORS = ['#ffd400', '#ff3b30', '#34c759', '#ffffff'] as const;

/** Points are 0..1 of the frame so a drawing survives a resize or fullscreen. */
export type MarkupPoint = [number, number];
export type MarkupStroke = { tool: MarkupTool; color: string; points: MarkupPoint[] };

/** `history` holds earlier stroke lists so Clear can be undone too. */
export type MarkupState = { strokes: MarkupStroke[]; history: MarkupStroke[][] };

export const EMPTY_MARKUP: MarkupState = { strokes: [], history: [] };

export function normPoint(x: number, y: number, width: number, height: number): MarkupPoint {
  const nx = width > 0 ? Math.min(1, Math.max(0, x / width)) : 0;
  const ny = height > 0 ? Math.min(1, Math.max(0, y / height)) : 0;
  return [nx, ny];
}

/** A circle or arrow keeps only its start and end. A pen keeps every point. */
export function extendStroke(stroke: MarkupStroke, point: MarkupPoint): MarkupStroke {
  if (stroke.tool === 'pen') return { ...stroke, points: [...stroke.points, point] };
  return { ...stroke, points: [stroke.points[0] ?? point, point] };
}

/** A tap without a drag is not a mark. */
export function strokeIsMark(stroke: MarkupStroke): boolean {
  if (stroke.points.length < 2) return false;
  const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
  if (stroke.tool === 'pen') return stroke.points.length >= 2;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01;
}

export function addStroke(state: MarkupState, stroke: MarkupStroke): MarkupState {
  if (!strokeIsMark(stroke)) return state;
  return { strokes: [...state.strokes, stroke], history: [...state.history, state.strokes] };
}

export function undoMarkup(state: MarkupState): MarkupState {
  if (!state.history.length) return state;
  const history = state.history.slice(0, -1);
  return { strokes: state.history[state.history.length - 1], history };
}

export function clearMarkup(state: MarkupState): MarkupState {
  if (!state.strokes.length) return state;
  return { strokes: [], history: [...state.history, state.strokes] };
}

export function canUndo(state: MarkupState): boolean {
  return state.history.length > 0;
}

export function canClear(state: MarkupState): boolean {
  return state.strokes.length > 0;
}

/* ---------- Drawing geometry (canvas-free so it can be tested) ---------- */

/** Circle tool: an ellipse inside the box dragged from start to end. */
export function ellipseFromDrag(a: MarkupPoint, b: MarkupPoint, width: number, height: number) {
  const x0 = a[0] * width;
  const y0 = a[1] * height;
  const x1 = b[0] * width;
  const y1 = b[1] * height;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: Math.abs(x1 - x0) / 2, ry: Math.abs(y1 - y0) / 2 };
}

/** Arrow tool: the two barb ends of the head at `b`, in pixels. */
export function arrowHead(a: MarkupPoint, b: MarkupPoint, width: number, height: number, size = 18): [[number, number], [number, number]] {
  const ax = a[0] * width;
  const ay = a[1] * height;
  const bx = b[0] * width;
  const by = b[1] * height;
  const angle = Math.atan2(by - ay, bx - ax);
  const spread = Math.PI / 7;
  return [
    [bx - size * Math.cos(angle - spread), by - size * Math.sin(angle - spread)],
    [bx - size * Math.cos(angle + spread), by - size * Math.sin(angle + spread)],
  ];
}

/* ---------- Where a copy can go ---------- */

/**
 * Save targets in order. Advantage Cloud only when this page already confirmed
 * Plus Cloud and this person can upload (the existing #370 gate). Google Drive
 * or OneDrive only when the gym already connected that folder.
 */
export function replaySaveTargets(input: {
  cloudUpload: boolean;
  driveConnected: boolean;
  oneDriveConnected: boolean;
}): ReplaySaveKind[] {
  const out: ReplaySaveKind[] = [];
  if (input.cloudUpload) out.push('advantage-cloud');
  if (input.driveConnected) out.push('google-drive');
  if (input.oneDriveConnected) out.push('onedrive');
  return out;
}

export const REPLAY_SAVE_LABELS: Record<ReplaySaveKind, string> = {
  'advantage-cloud': 'Save to Advantage Cloud',
  'google-drive': 'Save to Google Drive',
  onedrive: 'Save to OneDrive',
};

export const REPLAY_SAVED_LABELS: Record<ReplaySaveKind, string> = {
  'advantage-cloud': 'Saved to Advantage Cloud',
  'google-drive': 'Saved to Google Drive',
  onedrive: 'Saved to OneDrive',
};

/** File name for a saved copy: date, card title, and the right extension. */
export function replayFileName(dateKey: string, title: string, mime: string, id: string): string {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('quicktime') ? 'mov' : 'mp4';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const tail = id.replace(/[^a-z0-9]/gi, '').slice(-6) || 'clip';
  return `replay-${dateKey}-${slug || 'analysis'}-${tail}.${ext}`;
}
