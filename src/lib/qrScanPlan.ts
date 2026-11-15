import { decodeQrImageData, type QrImage } from './qrScan.ts';

/** One pass of the decoder: a source rectangle drawn at a target size. */
export type ScanRegion = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
};

export type ScanMode = 'photo' | 'live';

/** Photos: full detail first (a 12MP iPhone photo shrunk to 720px loses the QR). */
export const PHOTO_SCAN_MAX = 2000;
/** Live frames: up to 1080px, plus a center square where the QR usually sits. */
export const LIVE_SCAN_MAX = 1080;
/** The old single pass, kept as the last fallback. */
export const FALLBACK_SCAN_MAX = 720;
/** Share of the short side kept by the center crop. */
export const CENTER_CROP = 0.6;
/** Live decode at most this often, instead of every animation frame. */
export const LIVE_SCAN_INTERVAL_MS = 150;

function fit(sx: number, sy: number, sw: number, sh: number, max: number): ScanRegion {
  const scale = Math.min(1, max / Math.max(sw, sh));
  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(sw),
    sh: Math.round(sh),
    dw: Math.max(1, Math.round(sw * scale)),
    dh: Math.max(1, Math.round(sh * scale)),
  };
}

function centerSquare(width: number, height: number, share: number, max: number): ScanRegion {
  const side = Math.min(width, height) * share;
  return fit((width - side) / 2, (height - side) / 2, side, side, max);
}

/**
 * The passes the scanner tries, in order, for one image or video frame.
 * Photo: full frame at up to 2000px, a center crop, then the old 720px pass.
 * Live: full frame at up to 1080px, the center square, then 720px.
 */
export function scanRegions(width: number, height: number, mode: ScanMode): ScanRegion[] {
  if (!(width >= 21 && height >= 21)) return [];
  const passes =
    mode === 'photo'
      ? [
          fit(0, 0, width, height, PHOTO_SCAN_MAX),
          centerSquare(width, height, CENTER_CROP, PHOTO_SCAN_MAX),
          fit(0, 0, width, height, FALLBACK_SCAN_MAX),
        ]
      : [
          fit(0, 0, width, height, LIVE_SCAN_MAX),
          centerSquare(width, height, 1, LIVE_SCAN_MAX),
          fit(0, 0, width, height, FALLBACK_SCAN_MAX),
        ];
  const seen = new Set<string>();
  return passes.filter((pass) => {
    if (pass.dw < 21 || pass.dh < 21) return false;
    const key = `${pass.sx},${pass.sy},${pass.sw},${pass.sh},${pass.dw},${pass.dh}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Try each pass until one reads. `draw` renders a pass to pixels (canvas in the browser). */
export function decodeRegions(regions: readonly ScanRegion[], draw: (region: ScanRegion) => QrImage | null): string | null {
  for (const region of regions) {
    const image = draw(region);
    if (!image) continue;
    const text = decodeQrImageData(image);
    if (text) return text;
  }
  return null;
}

/* ---------------- Scanner feedback copy ---------------- */

export const SCAN_LOOKING = 'Looking for the QR… hold it steady and fill the box.';
export const SCAN_SLOW =
  "Still can't read it. Move closer, turn up the other phone's brightness, or tap Take a photo of the QR.";
export const SCAN_GOT = 'Got it. Checking the code…';
export const SCAN_CHECKING = 'Checking…';
export const SCAN_IOS_TIP = 'On iPhone, scan with this button, not the Camera app, so it connects inside Advantage.';
/** After this long with no read, the live hint turns into SCAN_SLOW (scanning keeps going). */
export const SCAN_SLOW_AFTER_MS = 15000;

export type ScanPhase = 'idle' | 'looking' | 'slow' | 'got';
/** What the page decided about the scanned code. */
export type ScanResult = { kind: 'ok' | 'error' | 'pending'; text: string };
export type ScanFeedback = { role: 'status' | 'alert'; tone: 'info' | 'ok' | 'error'; text: string } | null;

/** One line under the scanner: the page's result wins over the scanner's own phase. */
export function scanFeedback(phase: ScanPhase, result?: ScanResult | null, error?: string): ScanFeedback {
  if (error) return { role: 'alert', tone: 'error', text: error };
  if (result?.kind === 'error') return { role: 'alert', tone: 'error', text: result.text };
  if (result?.kind === 'ok') return { role: 'status', tone: 'ok', text: result.text };
  if (result?.kind === 'pending') return { role: 'status', tone: 'info', text: result.text || SCAN_CHECKING };
  if (phase === 'looking') return { role: 'status', tone: 'info', text: SCAN_LOOKING };
  if (phase === 'slow') return { role: 'status', tone: 'info', text: SCAN_SLOW };
  if (phase === 'got') return { role: 'status', tone: 'info', text: SCAN_GOT };
  return null;
}

/** iPhone / iPad (iPadOS reports as Mac with touch). */
export function isAppleMobile(nav: { userAgent?: string; platform?: string; maxTouchPoints?: number } | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}
