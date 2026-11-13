import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type TreeChoice = {
  id: string;
  name: string;
  detail: string;
};

type Props = {
  showVideo: boolean;
  videoLabel: string;
  clipUrl?: string;
  /** Clip name saved with that day's plan. Empty when the slot has no media. */
  mediaName?: string;
  videoAction?: 'open' | 'play';
  player?: ReactNode;
  onPlay: () => void;
  linkedTree?: { id: string; name: string } | null;
  treeChoices?: TreeChoice[];
  canEditTree?: boolean;
  storedTreeId?: string;
  onOpenTree?: (treeId: string) => void;
  onPickTree?: (treeId: string | null) => void;
  /** Empty-library link. Callers pass the hub flag so Back stays on that hub. */
  treeLibraryTo?: string;
  /** Edit this class plan's clip without deleting the library file. */
  canEditVideos?: boolean;
  onReplace?: () => void;
  onRemove?: () => void;
};

/** Small video preview plus an optional Technique Tree control for one lesson section. */
export function LessonMediaRail({
  showVideo,
  videoLabel,
  clipUrl,
  mediaName = '',
  /** `play` stays on the lesson plan. `open` goes to Daily Training Videos. */
  videoAction = 'open',
  /** Inline player. Replaces the thumbnail while a clip is open on the plan. */
  player = null,
  onPlay,
  linkedTree = null,
  treeChoices = [],
  canEditTree = false,
  storedTreeId,
  onOpenTree,
  onPickTree,
  treeLibraryTo = '/technique-tree',
  canEditVideos = false,
  onReplace,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [menu, setMenu] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const canEdit = canEditTree && Boolean(onPickTree);
  const showTree = Boolean(linkedTree && onOpenTree) || canEdit;

  useEffect(() => {
    setThumbFailed(false);
    setConfirmRemove(false);
  }, [clipUrl]);

  const placeMenu = () => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(288, window.innerWidth - 32);
    const left = Math.min(Math.max(16, rect.right - width), window.innerWidth - width - 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openBelow = spaceBelow >= 160 || rect.top < 160;
    if (openBelow) {
      setMenu({ left, width, top: rect.bottom + 6, maxHeight: Math.max(96, spaceBelow - 12) });
      return;
    }
    setMenu({
      left,
      width,
      bottom: window.innerHeight - rect.top + 6,
      maxHeight: Math.max(96, rect.top - 12),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && railRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!showVideo && !showTree) return null;

  const seekFrame = (video: HTMLVideoElement) => {
    if (video.duration > 0.15 && video.currentTime < 0.05) {
      video.currentTime = Math.min(0.2, video.duration * 0.04);
    }
  };

  return (
    <div className="notes__media" ref={railRef}>
      {player ? (
        player
      ) : showVideo ? (
        <button
          type="button"
          className={clipUrl && !thumbFailed ? 'notes__video notes__video--on' : 'notes__video notes__video--go'}
          aria-label={
            videoAction === 'play' ? `Play ${videoLabel}` : `Open Daily Training Videos for ${videoLabel}`
          }
          title={videoAction === 'play' ? `Play ${videoLabel}` : `Open Daily Training Videos for ${videoLabel}`}
          onClick={onPlay}
        >
          {clipUrl && !thumbFailed ? (
            <video
              className="notes__video-thumb"
              src={clipUrl}
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
              onLoadedMetadata={(event) => seekFrame(event.currentTarget)}
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <span className="notes__video-empty" aria-hidden="true" />
          )}
          {clipUrl && !thumbFailed ? <span className="notes__video-mark" aria-hidden="true" /> : null}
        </button>
      ) : null}
      {showVideo && mediaName ? <p className="notes__video-name">{mediaName}</p> : null}
      {showVideo && clipUrl && canEditVideos && onReplace && onRemove ? (
        confirmRemove ? (
          <div className="notes__video-actions notes__confirm" role="group" aria-label={`Remove ${videoLabel} from this lesson plan`}>
            <p>Remove this video from this lesson plan? The file stays in your library.</p>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setConfirmRemove(false);
                onRemove();
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="notes__video-actions">
            <button type="button" className="btn" onClick={onReplace}>
              Replace
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          </div>
        )
      ) : null}
      {linkedTree && onOpenTree ? (
        <button
          type="button"
          className="notes__tree"
          aria-label={`Open Technique Tree ${linkedTree.name}`}
          onClick={() => onOpenTree(linkedTree.id)}
        >
          <span className="notes__tree-kicker">Tree</span>
          <span className="notes__tree-label">{linkedTree.name}</span>
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className={linkedTree ? 'notes__tree notes__tree--change' : 'notes__tree notes__tree--link'}
          aria-expanded={open}
          aria-label={linkedTree ? `Change Technique Tree for ${videoLabel}` : `Link a Technique Tree for ${videoLabel}`}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            placeMenu();
            setOpen(true);
          }}
        >
          {open ? 'Close' : linkedTree ? 'Change' : 'Link tree'}
        </button>
      ) : null}
      {open && canEdit && menu ? (
        <ul
          className="notes__tree-pick"
          aria-label={`Technique Trees for ${videoLabel}`}
          style={{
            top: menu.top,
            bottom: menu.bottom,
            left: menu.left,
            width: menu.width,
            maxHeight: menu.maxHeight,
          }}
        >
          {treeChoices.length ? (
            treeChoices.map((choice) => (
              <li key={choice.id}>
                <button
                  type="button"
                  className={linkedTree?.id === choice.id ? 'notes__tree-choice notes__tree-choice--on' : 'notes__tree-choice'}
                  onClick={() => {
                    onPickTree?.(choice.id);
                    setOpen(false);
                  }}
                >
                  <span>{choice.name}</span>
                  {choice.detail ? <small>{choice.detail}</small> : null}
                </button>
              </li>
            ))
          ) : (
            <li>
              <p className="notes__tree-none">No Technique Tree with a base yet.</p>
              <Link className="notes__tree-choice" to={treeLibraryTo} onClick={() => setOpen(false)}>
                <span>Open Technique Tree</span>
              </Link>
            </li>
          )}
          {storedTreeId ? (
            <li>
              <button
                type="button"
                className="notes__tree-choice"
                onClick={() => {
                  onPickTree?.(null);
                  setOpen(false);
                }}
              >
                <span>Clear link</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
