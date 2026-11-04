import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  EMPTY_MARKUP,
  MARKUP_COLORS,
  MARKUP_TOOLS,
  MARKUP_TOOL_LABELS,
  SEEK_STEP_SECONDS,
  addStroke,
  arrowHead,
  canClear,
  canUndo,
  clearMarkup,
  ellipseFromDrag,
  extendStroke,
  formatClock,
  normPoint,
  registerTap,
  scrubKey,
  scrubTime,
  seekBy,
  tapZone,
  undoMarkup,
  type MarkupState,
  type MarkupStroke,
  type MarkupTool,
  type TapMemory,
} from '../lib/replayAnalysis';

type Props = {
  src: string;
  /** Used in labels, e.g. "Video replay analysis 2". */
  label: string;
  /** File name for "Save picture". */
  frameName: string;
};

function drawStroke(ctx: CanvasRenderingContext2D, stroke: MarkupStroke, width: number, height: number): void {
  const [a, b] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
  if (!a || !b) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = Math.max(3, Math.round(Math.min(width, height) / 120));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (stroke.tool === 'circle') {
    const e = ellipseFromDrag(a, b, width, height);
    ctx.ellipse(e.cx, e.cy, Math.max(1, e.rx), Math.max(1, e.ry), 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (stroke.tool === 'arrow') {
    ctx.moveTo(a[0] * width, a[1] * height);
    ctx.lineTo(b[0] * width, b[1] * height);
    ctx.stroke();
    const [l, r] = arrowHead(a, b, width, height, ctx.lineWidth * 5);
    ctx.beginPath();
    ctx.moveTo(b[0] * width, b[1] * height);
    ctx.lineTo(l[0], l[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.closePath();
    ctx.fill();
    return;
  }
  stroke.points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x * width, y * height);
    else ctx.lineTo(x * width, y * height);
  });
  ctx.stroke();
}

function paint(canvas: HTMLCanvasElement | null, strokes: readonly MarkupStroke[], draft: MarkupStroke | null): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = Math.max(1, Math.round(rect.width * ratio));
  const h = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  for (const stroke of strokes) drawStroke(ctx, stroke, w, h);
  if (draft) drawStroke(ctx, draft, w, h);
}

/**
 * Replay player for one analysis clip.
 * Double-tap the left or right side to skip 10 seconds; tap the middle to
 * play or pause. Drag the bar to scrub. Pause to draw a circle, arrow, or
 * pen line on the frame, with Undo and Clear. Drawings clear when play
 * resumes because the frame under them changes.
 */
export function ReplayPlayer({ src, label, frameName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const tapRef = useRef<TapMemory>(null);
  const tapTimer = useRef<number | null>(null);
  const scrubbing = useRef<{ resume: boolean } | null>(null);
  const draftRef = useRef<MarkupStroke | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  /** Stage matches the clip shape so marks line up with the saved picture. */
  const [aspect, setAspect] = useState(16 / 9);
  const [flash, setFlash] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkupTool | null>(null);
  const [color, setColor] = useState<string>(MARKUP_COLORS[0]);
  const [markup, setMarkup] = useState<MarkupState>(EMPTY_MARKUP);

  useEffect(() => {
    paint(canvasRef.current, markup.strokes, draftRef.current);
  }, [markup, playing]);

  useEffect(() => {
    setMarkup(EMPTY_MARKUP);
    setTime(0);
    setDuration(0);
    setAspect(16 / 9);
    setPlaying(false);
  }, [src]);

  useEffect(
    () => () => {
      if (tapTimer.current != null) window.clearTimeout(tapTimer.current);
    },
    [],
  );

  const seekTo = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = next;
    setTime(next);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setTool(null);
      setMarkup(EMPTY_MARKUP);
      void video.play().catch(() => setPlaying(false));
    } else video.pause();
  }, []);

  const skip = useCallback(
    (direction: -1 | 1) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(seekBy(video.currentTime, direction, video.duration));
      setFlash(direction < 0 ? `−${SEEK_STEP_SECONDS}s` : `+${SEEK_STEP_SECONDS}s`);
      window.setTimeout(() => setFlash(null), 600);
    },
    [seekTo],
  );

  const onTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = tapZone(event.clientX - rect.left, rect.width);
    if (zone === 0) {
      tapRef.current = null;
      togglePlay();
      return;
    }
    const result = registerTap(tapRef.current, zone, Date.now());
    tapRef.current = result.memory;
    if (result.seek) skip(result.seek);
  };

  const scrubFrom = (clientX: number) => {
    const bar = barRef.current;
    const video = videoRef.current;
    if (!bar || !video) return;
    const rect = bar.getBoundingClientRect();
    seekTo(scrubTime(clientX, rect.left, rect.width, video.duration));
  };

  const onBarDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    scrubbing.current = { resume: !video.paused };
    video.pause();
    scrubFrom(event.clientX);
  };

  const onBarMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) scrubFrom(event.clientX);
  };

  const onBarUp = () => {
    const state = scrubbing.current;
    scrubbing.current = null;
    if (state?.resume) void videoRef.current?.play().catch(() => setPlaying(false));
  };

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return normPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  };

  const onDrawDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!tool) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    draftRef.current = { tool, color, points: [canvasPoint(event)] };
  };

  const onDrawMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current) return;
    draftRef.current = extendStroke(draftRef.current, canvasPoint(event));
    paint(canvasRef.current, markup.strokes, draftRef.current);
  };

  const onDrawUp = () => {
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft) setMarkup((state) => addStroke(state, draft));
    else paint(canvasRef.current, markup.strokes, null);
  };

  const saveFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, out.width, out.height);
    for (const stroke of markup.strokes) drawStroke(ctx, stroke, out.width, out.height);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = frameName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };

  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const drawing = !playing && tool !== null;

  return (
    <div className="replay-player" data-playing={playing ? 'true' : 'false'}>
      <div
        className="replay-player__stage"
        style={{ aspectRatio: String(aspect), maxWidth: `min(100%, calc(70vh * ${aspect.toFixed(4)}))` }}
      >
        <video
          ref={videoRef}
          className="replay-player__video"
          src={src}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            if (!scrubbing.current) setTime(event.currentTarget.currentTime);
          }}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(Number.isFinite(video.duration) ? video.duration : 0);
            if (video.videoWidth > 0 && video.videoHeight > 0) setAspect(video.videoWidth / video.videoHeight);
          }}
          onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        />
        {drawing ? null : (
          <div
            className="replay-player__taps"
            role="presentation"
            data-testid="replay-tap-layer"
            onPointerUp={onTap}
          />
        )}
        <canvas
          ref={canvasRef}
          className={drawing ? 'replay-player__ink replay-player__ink--on' : 'replay-player__ink'}
          aria-label={drawing ? `Draw on ${label}` : undefined}
          aria-hidden={drawing ? undefined : true}
          onPointerDown={onDrawDown}
          onPointerMove={onDrawMove}
          onPointerUp={onDrawUp}
          onPointerCancel={onDrawUp}
        />
        {flash ? (
          <span className="replay-player__flash" aria-live="polite">
            {flash}
          </span>
        ) : null}
      </div>

      <div
        ref={barRef}
        className="replay-player__bar"
        role="slider"
        tabIndex={0}
        aria-label={`Scrub ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
        onPointerDown={onBarDown}
        onPointerMove={onBarMove}
        onPointerUp={onBarUp}
        onPointerCancel={onBarUp}
        onKeyDown={(event) => {
          const next = scrubKey(event.key, time, duration);
          if (next == null) return;
          event.preventDefault();
          seekTo(next);
        }}
      >
        <span className="replay-player__fill" style={{ width: `${progress}%` }} />
        <span className="replay-player__knob" style={{ left: `${progress}%` }} />
      </div>

      <div className="replay-player__controls">
        <button type="button" className="btn btn--ghost" onClick={() => skip(-1)} aria-label={`Back ${SEEK_STEP_SECONDS} seconds`}>
          −{SEEK_STEP_SECONDS}s
        </button>
        <button type="button" className="btn" onClick={togglePlay}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => skip(1)} aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}>
          +{SEEK_STEP_SECONDS}s
        </button>
        <span className="replay-player__clock">
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>

      {playing ? (
        <p className="replay-player__hint">Double-tap left or right to skip 10 seconds. Pause to draw.</p>
      ) : (
        <div className="replay-player__markup" role="toolbar" aria-label="Markup">
          {MARKUP_TOOLS.map((item) => (
            <button
              key={item}
              type="button"
              className={tool === item ? 'btn replay-player__tool replay-player__tool--on' : 'btn btn--ghost replay-player__tool'}
              aria-pressed={tool === item}
              onClick={() => setTool((current) => (current === item ? null : item))}
            >
              {MARKUP_TOOL_LABELS[item]}
            </button>
          ))}
          <span className="replay-player__colors" role="group" aria-label="Color">
            {MARKUP_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={color === swatch ? 'replay-player__swatch replay-player__swatch--on' : 'replay-player__swatch'}
                style={{ background: swatch }}
                aria-label={`Color ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
              />
            ))}
          </span>
          <button type="button" className="btn btn--ghost" disabled={!canUndo(markup)} onClick={() => setMarkup(undoMarkup)}>
            Undo
          </button>
          <button type="button" className="btn btn--ghost" disabled={!canClear(markup)} onClick={() => setMarkup(clearMarkup)}>
            Clear
          </button>
          <button type="button" className="btn btn--ghost" disabled={!duration} onClick={saveFrame}>
            Save picture
          </button>
        </div>
      )}
    </div>
  );
}
