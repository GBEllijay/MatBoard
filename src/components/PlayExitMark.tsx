type Props = {
  onExit: () => void;
};

/** Subtle Advantage corner mark that exits play (fullscreen + Home). */
export function PlayExitMark({ onExit }: Props) {
  return (
    <button
      type="button"
      className="play-exit"
      aria-label="Home"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onExit();
      }}
    >
      <img src="/advantage-icon.png" alt="" width={713} height={713} />
    </button>
  );
}
