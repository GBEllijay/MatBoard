import { Link } from 'react-router-dom';
import { PlayExitMark } from './PlayExitMark';
import { submenuHomeTarget } from '../lib/submenuNav';

type HomeProps = {
  /** Tier picker. Student Edition preview keeps ?student=1 so the home card stays open. */
  to?: string;
};

/** Center Advantage mark. Always the tier picker, unless a preview flag has to ride along.
 * Size comes from --mark-home, which stays larger than the corner --mark-back. */
export function TierHomeMark({ to = submenuHomeTarget() }: HomeProps) {
  return (
    <Link className="tier-home" to={to} aria-label="Home">
      <img src="/advantage-icon.png" alt="" draggable={false} width={713} height={713} />
    </Link>
  );
}

type Props = {
  /** Menu that opened this page. */
  to: string;
  onExit?: () => void;
  /** Center logo destination. Defaults to the tier picker. */
  homeTo?: string;
};

/** Top-left back, one level. Center mark goes home. */
export function SubmenuMarks({ to, onExit, homeTo }: Props) {
  return (
    <>
      <PlayExitMark to={to} onExit={onExit} />
      <TierHomeMark to={homeTo} />
    </>
  );
}
