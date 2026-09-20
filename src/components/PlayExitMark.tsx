import { Link } from 'react-router-dom';

type Props = {
  /** Exit play (fullscreen) then go Home. Omit to navigate immediately. */
  onExit?: () => void;
  /** Parent page. White tools go to `/white`; Pro/Coach tools go to `/pro` or `/coach`. */
  to?: string;
};

/** Subtle Advantage corner mark that goes Home. Shared by play and manage screens. */
export function PlayExitMark({ onExit, to = '/' }: Props) {
  return (
    <Link
      to={to}
      className="play-exit"
      aria-label="Home"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!onExit) return;
        event.preventDefault();
        onExit();
      }}
    >
      <img src="/advantage-icon.png" alt="" width={713} height={713} />
    </Link>
  );
}
