import type { ReactNode } from 'react';

/** Raised-fist (penalty) version of the Advantage badge, used only as the Back mark. */
export const PENALTY_BACK_SRC = '/advantage-penalty-icon.png';

/**
 * Corner Back icon: the Advantage timer badge with the referee's arm raised
 * in a penalty signal, so it is clearly the same mark as Home but a different pose.
 * The visible "Back" label sits under the badge for low-vision readers.
 * The parent link keeps the accessible name (aria-label), so this mark is hidden
 * from the accessibility tree. Sized for the 44px mark inside a 64px-wide hit target.
 */
export function BackButton(): ReactNode {
  return (
    <span className="back-btn" aria-hidden="true">
      <img src={PENALTY_BACK_SRC} alt="" width={44} height={44} draggable={false} />
      <span className="back-btn__label">Back</span>
    </span>
  );
}
