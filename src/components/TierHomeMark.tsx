import { Link } from 'react-router-dom';
import { PlayExitMark } from './PlayExitMark';
import { submenuHomeTarget } from '../lib/submenuNav';

/** Small center Advantage mark. Always the tier picker. */
export function TierHomeMark() {
  return (
    <Link className="tier-home" to={submenuHomeTarget()} aria-label="Home">
      <img src="/advantage-icon.png" alt="" draggable={false} width={713} height={713} />
    </Link>
  );
}

type Props = {
  /** Menu that opened this page. */
  to: string;
  onExit?: () => void;
};

/** Top-left back, one level. Center mark goes home. */
export function SubmenuMarks({ to, onExit }: Props) {
  return (
    <>
      <PlayExitMark to={to} onExit={onExit} />
      <TierHomeMark />
    </>
  );
}
