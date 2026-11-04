import { Link } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useMediaUnlocked } from '../hooks/useMediaUnlocked';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { purchasePromptsHidden } from '../lib/instructorSeats';
import {
  WHITE_UPGRADE_LABEL,
  WHITE_UPGRADE_LINE,
  WHITE_UPGRADE_PATH,
  WHITE_UPGRADE_SUB,
  whiteUpgradePromptVisible,
} from '../lib/whiteUpgradePrompt';
import { useCurrentSeat } from './SeatSessionBar';

/**
 * White hub prompt under Match names. Student buy page, no dollar amount.
 * Hidden once Student or any higher tier is open, and for a live seat.
 */
export function WhiteUpgradePrompt() {
  const visible = whiteUpgradePromptVisible({
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
    media: useMediaUnlocked(),
    coach: useCoachUnlocked(),
    pro: useProUnlocked(),
    cloud: useProPlusCloudUnlocked(),
    seated: purchasePromptsHidden(useCurrentSeat()),
  });
  if (!visible) return null;
  return (
    <Link className="white-upgrade" to={WHITE_UPGRADE_PATH} aria-label={WHITE_UPGRADE_LABEL} data-testid="white-upgrade">
      <span className="belt-tip belt-tip--blue white-upgrade__mark" aria-hidden="true">
        <span className="belt-tip__bar" />
      </span>
      <span className="white-upgrade__copy">
        <span className="white-upgrade__line">{WHITE_UPGRADE_LINE}</span>
        <span className="white-upgrade__sub">{WHITE_UPGRADE_SUB}</span>
      </span>
    </Link>
  );
}
