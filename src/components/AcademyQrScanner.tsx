import { useEffect, useRef, useState } from 'react';
import { DeviceMediaInput } from './DeviceMediaInput';
import { decodeQrImageData } from '../lib/qrScan';

const SCAN_MAX = 720;

type Props = {
  onScan: (text: string) => void;
};

function readSource(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | null {
  if (width < 21 || height < 21) return null;
  const scale = Math.min(1, SCAN_MAX / Math.max(width, height));
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, nextWidth, nextHeight);
  return decodeQrImageData(ctx.getImageData(0, 0, nextWidth, nextHeight));
}

/**
 * Camera scan for the academy QR, plus a photo of that QR when the live
 * camera does not open. The pasted link stays beside this control.
 */
export function AcademyQrScanner({ onScan }: Props) {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');

  const stop = () => {
    stopRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setLive(false);
  };

  useEffect(() => {
    return () => {
      stopRef.current = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser has no live camera. Take a photo of the QR, or paste the academy link.');
      return;
    }
    stopRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
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
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      const tick = () => {
        if (stopRef.current) return;
        const frame = videoRef.current;
        if (frame && frame.readyState >= 2 && frame.videoWidth > 0) {
          const text = readSource(frame, frame.videoWidth, frame.videoHeight, canvas);
          if (text) {
            stop();
            onScan(text);
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

  const onPhoto = async (files: readonly File[]) => {
    const file = files[0];
    if (!file) return;
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvasRef.current = canvas;
      const text = readSource(bitmap, bitmap.width, bitmap.height, canvas);
      bitmap.close();
      if (!text) {
        setError('That photo has no academy QR. Try again, or paste the academy link.');
        return;
      }
      onScan(text);
    } catch {
      setError('That photo could not be read. Paste the academy link.');
    }
  };

  return (
    <div className="academy-scan">
      <div className="academy-scan__actions">
        <button type="button" className="ink-btn" onClick={() => void start()} disabled={live}>
          Scan academy QR
        </button>
        <DeviceMediaInput
          inputRef={photoRef}
          id="academy-qr-photo"
          accept="image/*"
          capture="environment"
          onFiles={(files) => void onPhoto(files)}
        />
        <label className="ink-btn" htmlFor="academy-qr-photo">
          Take a photo of the QR
        </label>
        {live ? (
          <button type="button" className="ink-btn" onClick={stop}>
            Stop camera
          </button>
        ) : null}
      </div>
      <video
        ref={videoRef}
        className={live ? 'academy-scan__video' : 'sr-only'}
        muted
        playsInline
        aria-label="Academy QR camera"
      />
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
