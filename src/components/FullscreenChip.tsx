type Props = {
  supported: boolean;
  active: boolean;
  nudge?: boolean;
  shortcut?: boolean;
  onToggle: () => void;
};

export function FullscreenChip({ supported, active, nudge, shortcut, onToggle }: Props) {
  if (!supported) return null;
  return (
    <button
      type="button"
      className={`chip play-fs${nudge && !active ? ' chip--gold play-fs--nudge' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {active ? 'Exit fullscreen' : shortcut ? 'Fullscreen · F' : 'Fullscreen'}
    </button>
  );
}
