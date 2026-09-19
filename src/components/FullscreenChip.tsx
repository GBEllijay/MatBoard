type Props = {
  supported: boolean;
  active: boolean;
  nudge?: boolean;
  shortcut?: boolean;
  onToggle: () => void;
};

export function FullscreenChip({ supported, active, nudge, shortcut, onToggle }: Props) {
  if (!supported || active) return null;
  return (
    <button
      type="button"
      className={`chip play-fs${nudge ? ' chip--gold play-fs--nudge' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {shortcut ? 'Fullscreen · F' : 'Fullscreen'}
    </button>
  );
}
