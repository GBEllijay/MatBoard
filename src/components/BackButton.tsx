import type { ReactNode } from 'react';

export type BackButtonTone = 'penalty' | 'navy';

export const BACK_BUTTON_TONES: Record<BackButtonTone, { disc: string; figure: string }> = {
  /** Muted penalty red so the control is not the brand mark. */
  penalty: { disc: '#9B2433', figure: '#F5F1E8' },
  /** Alternate navy/cream control. */
  navy: { disc: '#1A2740', figure: '#F5F1E8' },
};

type Props = {
  /** Color theme. Default is the muted penalty red. */
  tone?: BackButtonTone;
};

/**
 * Corner Back icon: the referee penalty signal (raised fist) with a small
 * back arrow under the figure. Sized for the 44px mark inside the 64px hit target.
 */
export function BackButton({ tone = 'penalty' }: Props): ReactNode {
  const { disc, figure } = BACK_BUTTON_TONES[tone];
  return (
    <span className={`back-btn back-btn--${tone}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={44} height={44} focusable="false">
        <circle cx="32" cy="32" r="31" fill={disc} />
        <circle cx="32" cy="32" r="29.15" fill="none" stroke={figure} strokeWidth="1.3" opacity="0.28" />
        <g fill={figure}>
          <g transform="rotate(-16 22.4 14.4)">
            <rect x="15.6" y="8" width="13.4" height="12.8" rx="3.3" />
          </g>
          <ellipse cx="28.8" cy="14.2" rx="3.6" ry="2.65" transform="rotate(-30 28.8 14.2)" />
          <ellipse cx="39" cy="23.4" rx="7.2" ry="7.4" />
          <path d="M21.6 18.2C20.2 21.4 20.8 25.6 24.6 29C26.2 30.4 28.2 31 30.2 31.1H42.2C44.8 31.2 47 32.8 48.2 36.2C49.4 39.8 50.2 44 50.6 47.2C50.8 48.8 49.6 49.8 48 49.6C46.4 49.4 45.8 47.6 45.4 45.4C44.9 42.2 44.4 39 43.6 37C43.4 39.6 43.2 43.4 43 48H30.6C30.2 42.8 29.4 37.8 27.8 34.4C26 32.6 23.8 30.2 22.4 27C21.4 24.4 21 21.2 21.6 18.2Z" />
          <path d="M32.4 51.8 20.2 56.2 32.4 60.6V58.2H44V53.8H32.4Z" />
        </g>
      </svg>
    </span>
  );
}
