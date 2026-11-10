import { FullscreenChip } from './FullscreenChip';

/**
 * Start, Stop, and Fullscreen attached to one video player.
 * The daily-videos header used to hold these, which sent the coach down to
 * the clip and left Fullscreen at the top of the page.
 */
export function ClipDock({
  playing,
  canStart,
  fullscreen,
  showFullscreen,
  onStart,
  onStop,
  onToggleFullscreen,
}: {
  playing: boolean;
  canStart: boolean;
  fullscreen: boolean;
  showFullscreen: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="techniques__dock" role="group" aria-label="Playback" data-player-dock="">
      <button type="button" className="btn" disabled={!canStart} onClick={onStart}>
        Start
      </button>
      <button type="button" className="btn btn--ghost" disabled={!playing} onClick={onStop}>
        Stop
      </button>
      {showFullscreen ? (
        <FullscreenChip supported active={fullscreen} onToggle={onToggleFullscreen} />
      ) : null}
    </div>
  );
}
