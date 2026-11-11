import { useEffect, useRef, useState, type ReactNode } from 'react';
import { exitPageFullscreen, fullscreenElement, requestElementFullscreen } from '../lib/fullscreen';
import { formatMmSs } from '../lib/format';
import { ClipDock } from './ClipDock';
import { LessonMediaRail } from './LessonMediaRail';
import { LoopClip } from './LoopClip';

type TreeChoice = {
  id: string;
  name: string;
  detail: string;
};

type Props = {
  showVideo: boolean;
  label: string;
  clipUrl?: string;
  mediaName?: string;
  /** Timed loop from the lesson block. Omitted keeps the untimed loop. */
  loopMs?: number;
  /** No clip yet: open Daily Training Videos so the coach can add one. */
  onOpenBoard: () => void;
  linkedTree?: { id: string; name: string } | null;
  treeChoices?: TreeChoice[];
  canEditTree?: boolean;
  storedTreeId?: string;
  onOpenTree?: (treeId: string) => void;
  onPickTree?: (treeId: string | null) => void;
  treeLibraryTo?: string;
  /** Focus layout opens the clip immediately. The stacked cards still wait for a tap. */
  startOpen?: boolean;
  /** Draw Start / Stop / Fullscreen under the picture instead of on it. */
  dockBelow?: boolean;
};

/**
 * Lesson-plan video. A clip plays here, on the plan, with start, fullscreen,
 * and the technique-time loop. An empty slot still opens Daily Training Videos.
 */
export function LessonSectionVideo({
  showVideo,
  label,
  clipUrl,
  mediaName = '',
  loopMs,
  onOpenBoard,
  linkedTree = null,
  treeChoices = [],
  canEditTree = false,
  storedTreeId,
  onOpenTree,
  onPickTree,
  treeLibraryTo,
  startOpen = false,
  dockBelow = false,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(startOpen && clipUrl));

  useEffect(() => {
    if (!clipUrl) setOpen(false);
    else if (startOpen) setOpen(true);
  }, [clipUrl, startOpen]);

  const player =
    open && clipUrl ? (
      <LessonInlinePlayer src={clipUrl} label={label} durationMs={loopMs} dockBelow={dockBelow} />
    ) : null;

  return (
    <LessonMediaRail
      showVideo={showVideo}
      videoLabel={label}
      clipUrl={clipUrl}
      mediaName={mediaName}
      videoAction={clipUrl ? 'play' : 'open'}
      player={player}
      onPlay={() => {
        if (clipUrl) {
          setOpen(true);
          return;
        }
        onOpenBoard();
      }}
      linkedTree={linkedTree}
      treeChoices={treeChoices}
      canEditTree={canEditTree}
      storedTreeId={storedTreeId}
      onOpenTree={onOpenTree}
      onPickTree={onPickTree}
      treeLibraryTo={treeLibraryTo}
    />
  );
}

function LessonInlinePlayer({
  src,
  label,
  durationMs,
  dockBelow = false,
}: {
  src: string;
  label: string;
  durationMs?: number;
  dockBelow?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [heardSrc, setHeardSrc] = useState(src);
  if (heardSrc !== src) {
    setHeardSrc(src);
    setMuted(true);
  }
  const [fullscreen, setFullscreen] = useState(false);
  const [left, setLeft] = useState(durationMs ?? 0);
  const timed = durationMs != null && durationMs > 0;

  useEffect(() => {
    setLeft(durationMs ?? 0);
  }, [durationMs, src]);

  useEffect(() => {
    const sync = () => {
      const root = rootRef.current;
      const current = fullscreenElement();
      if (fallbackRef.current && !current) return;
      fallbackRef.current = false;
      setFullscreen(Boolean(root && current === root));
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      fallbackRef.current = false;
      setFullscreen(false);
      void exitPageFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;
    if (fullscreenElement() === root || fullscreen) {
      fallbackRef.current = false;
      await exitPageFullscreen();
      setFullscreen(false);
      return;
    }
    if (!playing) setPlaying(true);
    const result = await requestElementFullscreen(root);
    if (result === 'unsupported') {
      fallbackRef.current = true;
      setFullscreen(true);
      return;
    }
    fallbackRef.current = false;
    setFullscreen(fullscreenElement() === root || result === 'webkit');
  };

  const dock = (
    <ClipDock
      playing={playing}
      canStart={!playing}
      fullscreen={fullscreen}
      showFullscreen
      onStart={() => setPlaying(true)}
      onStop={() => setPlaying(false)}
      onToggleFullscreen={() => void toggleFullscreen()}
    />
  );

  let overlay: ReactNode = <span className="techniques__live">Loop</span>;
  if (timed) {
    overlay = (
      <p
        className={`techniques__clock${left === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
        aria-live="polite"
      >
        <span className="techniques__loop">Loop</span>
        {formatMmSs(left)}
      </p>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`lesson-player${fullscreen ? ' lesson-player--fill' : ''}`}
      data-lesson-player=""
    >
      <div className="techniques__player" data-player="">
        <LoopClip
          src={src}
          label={label}
          playing={playing}
          muted={muted}
          unlockSound={!muted}
          fullscreen={fullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleMute={() => setMuted((current) => !current)}
          durationMs={timed ? durationMs : undefined}
          onDurationEnd={timed ? () => setPlaying(false) : undefined}
          onRemaining={timed ? setLeft : undefined}
          dock={dockBelow ? undefined : dock}
          overlay={overlay}
        />
      </div>
      {dockBelow && !fullscreen ? dock : null}
    </div>
  );
}
