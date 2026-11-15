import { useEffect, useRef, useState } from 'react';
import { DeviceMediaInput } from './DeviceMediaInput';
import {
  LIVE_SCAN_INTERVAL_MS,
  SCAN_IOS_TIP,
  SCAN_SLOW_AFTER_MS,
  decodeRegions,
  isAppleMobile,
  scanFeedback,
  scanRegions,
  type ScanMode,
  type ScanPhase,
  type ScanRegion,
  type ScanResult,
} from '../lib/qrScanPlan';

export type { ScanResult } from '../lib/qrScanPlan';

type Props = {
  onScan: (text: string) => void;
};

function drawRegion(source: CanvasImageSource, region: ScanRegion, canvas: HTMLCanvasElement) {
  canvas.width = region.dw;
  canvas.height = region.dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, region.dw, region.dh);
  return ctx.getImageData(0, 0, region.dw, region.dh);
}

/** Photo: every pass in order. Live: one pass per tick, rotating, so each tick stays cheap. */
function readSource(
  source: CanvasImageSource,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  mode: ScanMode,
  pass?: number,
): string | null {
  const regions = scanRegions(width, height, mode);
  if (!regions.length) return null;
  const chosen = pass === undefined ? regions : [regions[pass % regions.length]];
  return decodeRegions(chosen, (region) => drawRegion(source, region, canvas));
}

function buzz() {
  try {
    navigator.vibrate?.(80);
  } catch {
    // iOS has no vibrate; nothing to do.
  }
}

/**
 * Camera scan for the academy QR, plus a photo of that QR when the live
 * camera does not open. The pasted link stays beside this control.
 * Feedback sits right under the buttons: looking, still looking, got it,
 * then the page's own result (connected / why it failed).
 */
export function AcademyQrScanner({
  onScan,
  scanLabel = 'Scan academy QR',
  scanClassName = 'ink-btn',
  buttonClassName = 'ink-btn',
  photoId = 'academy-qr-photo',
  startSignal = 0,
  result = null,
  onStart,
  slowAfterMs = SCAN_SLOW_AFTER_MS,
}: Props & {
  scanLabel?: string;
  scanClassName?: string;
  buttonClassName?: string;
  /** Unique when two scanners share a page. */
  photoId?: string;
  /** Bump to open the camera from another button (Rescan). */
  startSignal?: number;
  /** What the page made of the scanned code; shown under the scanner. */
  result?: ScanResult | null;
  /** A new scan or photo began; the page can clear its old result. */
  onStart?: () => void;
  slowAfterMs?: number;
}) {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [ios] = useState(() => (typeof navigator === 'undefined' ? false : isAppleMobile(navigator)));

  const clearSlow = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = null;
  };

  const stop = () => {
    stopRef.current = true;
    clearSlow();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setLive(false);
    setPhase((current) => (current === 'got' ? current : 'idle'));
  };

  useEffect(() => {
    return () => {
      stopRef.current = true;
      clearSlow();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const got = (text: string) => {
    buzz();
    setPhase('got');
    onScan(text);
  };

  const start = async () => {
    setError('');
    setPhase('idle');
    onStart?.();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser has no live camera. Take a photo of the QR, or paste the academy link.');
      return;
    }
    stopRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (stopRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setLive(true);
      setPhase('looking');
      clearSlow();
      slowTimer.current = setTimeout(() => {
        if (!stopRef.current) setPhase((current) => (current === 'looking' ? 'slow' : current));
      }, slowAfterMs);
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      let last = 0;
      let pass = 0;
      const tick = (now: number) => {
        if (stopRef.current) return;
        const frame = videoRef.current;
        if (now - last >= LIVE_SCAN_INTERVAL_MS && frame && frame.readyState >= 2 && frame.videoWidth > 0) {
          last = now;
          const text = readSource(frame, frame.videoWidth, frame.videoHeight, canvas, 'live', pass);
          pass += 1;
          if (text) {
            stop();
            got(text);
            return;
          }
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    } catch {
      stop();
      setError('The camera did not open. Take a photo of the QR, or paste the academy link.');
    }
  };

  useEffect(() => {
    if (startSignal > 0) void start();
    // start is recreated each render; only a new signal opens the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal]);

  const onPhoto = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    setError('');
    setPhase('idle');
    onStart?.();
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      const text = readSource(bitmap, bitmap.width, bitmap.height, canvas, 'photo');
      bitmap.close();
      if (!text) {
        setError('That photo has no academy QR. Try again, or paste the academy link.');
        return;
      }
      got(text);
    } catch {
      setError('That photo could not be read. Paste the academy link.');
    }
  };

  const feedback = scanFeedback(phase, phase === 'got' || !live ? result : null, error);

  useEffect(() => {
    if (!result) return;
    const node = feedbackRef.current;
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [result?.kind, result?.text]);

  return (
    <div className="academy-scan">
      <div className="academy-scan__actions">
        <button type="button" className={scanClassName} onClick={() => void start()} disabled={live}>
          {scanLabel}
        </button>
        <DeviceMediaInput
          inputRef={photoRef}
          id={photoId}
          accept="image/*"
          capture="environment"
          onFiles={(files) => void onPhoto(files)}
        />
        <label className={buttonClassName} htmlFor={photoId}>
          Take a photo of the QR
        </label>
        {live ? (
          <button type="button" className={buttonClassName} onClick={stop}>
            Stop camera
          </button>
        ) : null}
      </div>
      <div ref={feedbackRef} className="academy-scan__feedback-slot">
        {feedback ? (
          <p role={feedback.role} className={`academy-scan__feedback academy-scan__feedback--${feedback.tone}`}>
            {feedback.tone === 'ok' ? (
              <span className="academy-scan__mark" aria-hidden="true">
                ✓{' '}
              </span>
            ) : feedback.tone === 'error' ? (
              <span className="academy-scan__mark" aria-hidden="true">
                ✕{' '}
              </span>
            ) : null}
            {feedback.text}
          </p>
        ) : null}
      </div>
      <video
        ref={videoRef}
        className={live ? 'academy-scan__video' : 'sr-only'}
        muted
        playsInline
        aria-label="Academy QR camera"
      />
      {ios ? <p className="academy-scan__tip">{SCAN_IOS_TIP}</p> : null}
    </div>
  );
}
