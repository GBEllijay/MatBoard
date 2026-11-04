/**
 * Bake Record for Review drawings into a clip, then hand that file to the
 * save the coach already uses (device download, Advantage Cloud, Google Drive,
 * OneDrive). This file does not open a new send path and does not change
 * saveReplayClip.
 *
 * Burn-in needs a canvas stream and MediaRecorder. iOS Safari still has no
 * canvas.captureStream, so that browser keeps the original clip and a still
 * of the drawings as two files.
 */

import { replayFileName } from './replayAnalysis.ts';

export const ANNOTATED_MIME_CANDIDATES = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const;

export const ANNOTATED_FALLBACK_COPY =
  'This browser cannot bake the drawings into the video. The clip and a still of the drawings were saved as separate files.';

export type AnnotatedRecord =
  | { burned: true; blob: Blob; mime: string }
  | { burned: false; reason: string };

export function chooseAnnotatedMime(isTypeSupported: (mime: string) => boolean): string | null {
  for (const mime of ANNOTATED_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      /* this browser refused the probe */
    }
  }
  return null;
}

export function burnInCaps(probe?: {
  captureStream?: boolean;
  mediaRecorder?: boolean;
  isTypeSupported?: (mime: string) => boolean;
}): { mime: string | null; available: boolean } {
  const captureStream =
    probe?.captureStream ??
    (typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function');
  const mediaRecorder = probe?.mediaRecorder ?? typeof MediaRecorder !== 'undefined';
  const isTypeSupported =
    probe?.isTypeSupported ??
    ((mime: string) => {
      try {
        return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime);
      } catch {
        return false;
      }
    });
  const mime = mediaRecorder ? chooseAnnotatedMime(isTypeSupported) : null;
  return { mime, available: Boolean(captureStream && mediaRecorder && mime) };
}

/** `annotated-replay-…mp4`, or a `.png` still when the drawings could not be baked in. */
export function annotatedFileName(dateKey: string, title: string, mime: string, id: string, picture = false): string {
  const named = `annotated-${replayFileName(dateKey, title, picture ? 'video/mp4' : mime, id)}`;
  if (!picture) return named;
  return named.replace(/\.mp4$/i, '.png');
}

export function fileNameForMime(name: string, mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = base.includes('webm') ? 'webm' : base.includes('png') ? 'png' : base.includes('quicktime') ? 'mov' : 'mp4';
  return `${name.replace(/\.(mp4|webm|mov|m4v|png)$/i, '')}.${ext}`;
}

type CanvasWithStream = HTMLCanvasElement & {
  captureStream?: (frameRate?: number) => MediaStream;
};

type VideoWithStream = HTMLVideoElement & {
  captureStream?: () => MediaStream;
};

/**
 * Play `video` once into a canvas with `paint` on every frame and return the
 * recording. The visible playhead is put back when this finishes. A browser
 * without a canvas stream returns `burned: false` and does not throw.
 */
export async function recordVisibleClip(
  video: HTMLVideoElement,
  paint: (ctx: CanvasRenderingContext2D, frame: CanvasImageSource, width: number, height: number) => void,
): Promise<AnnotatedRecord> {
  const caps = burnInCaps();
  if (!caps.available || !caps.mime) return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const capture = (canvas as CanvasWithStream).captureStream;
  if (!ctx || typeof capture !== 'function') return { burned: false, reason: ANNOTATED_FALLBACK_COPY };

  let stream: MediaStream;
  try {
    stream = capture.call(canvas, 30);
  } catch {
    return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
  }
  try {
    const audio = (video as VideoWithStream).captureStream?.().getAudioTracks()[0];
    if (audio) stream.addTrack(audio);
  } catch {
    /* the picture still records when this browser will not share the audio track */
  }

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: caps.mime });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      for (const track of stream.getTracks()) track.stop();
      return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
    }
  }

  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
  });
  const restore = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  const stopRecorder = () => {
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  try {
    recorder.start(200);
    try {
      video.currentTime = 0;
    } catch {
      /* some browsers only seek once playback has started */
    }
    await video.play();
    await new Promise<void>((resolve) => {
      const limitMs = (Number.isFinite(video.duration) ? video.duration + 1.5 : 20) * 1000;
      const timer = window.setTimeout(resolve, limitMs);
      const finish = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const draw = () => {
        try {
          paint(ctx, video, width, height);
        } catch {
          /* a tainted frame still ends the recording below */
        }
        if (video.ended || video.paused) {
          finish();
          return;
        }
        window.requestAnimationFrame(draw);
      };
      video.addEventListener('ended', finish, { once: true });
      window.requestAnimationFrame(draw);
    });
    stopRecorder();
    await stopped;
  } catch {
    stopRecorder();
    return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
  } finally {
    for (const track of stream.getTracks()) track.stop();
    try {
      video.pause();
    } catch {
      /* the coach can press Play again */
    }
    try {
      video.currentTime = restore;
    } catch {
      /* the playhead stays where the recording left it */
    }
  }

  const mime = (recorder.mimeType || caps.mime).split(';')[0] || caps.mime;
  const blob = new Blob(chunks, { type: mime });
  if (!blob.size) return { burned: false, reason: ANNOTATED_FALLBACK_COPY };
  return { burned: true, blob, mime };
}
