type Props = {
  supported: boolean;
  active: boolean;
  nudge?: boolean;
  onToggle: () => void;
};

export function FullscreenChip({ supported, active, nudge, onToggle }: Props) {
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
      Fullscreen
    </button>
  );
}
