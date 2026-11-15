import { Link } from 'react-router-dom';
import { BackButton, PENALTY_BACK_SRC } from '../../components/BackButton';
import { BeltHeader } from '../../components/BeltHeader';
import { HomeMark } from '../../components/HomeMark';
import { PlayExitMark } from '../../components/PlayExitMark';
import { TierHomeMark } from '../../components/TierHomeMark';
import { ADVANTAGE_MARK_SRC } from '../../lib/gymLogo';
import './backButtonPreview.css';

export const BACK_BUTTON_PREVIEW_PATH = '/preview/back-button';
export const BACK_BUTTON_LAYOUT_PREVIEW_PATH = '/preview/back-button-layout';

const PREVIEW_BANNER = 'Preview only. Nothing here is live until you approve it.';

function HeaderSample({ theme, label }: { theme: 'dark' | 'light'; label: string }) {
  return (
    <div className={`bb-preview__header bb-preview__header--${theme}`}>
      <Link className="play-exit" to="/" aria-label="Back">
        <BackButton />
      </Link>
      <p className="bb-preview__header-label">{label}</p>
    </div>
  );
}

function SideBySide({ size }: { size: number }) {
  return (
    <div className="bb-preview__pair">
      <figure>
        <img src={ADVANTAGE_MARK_SRC} alt="" width={size} height={size} />
        <figcaption>Home logo, {size}px</figcaption>
      </figure>
      <figure>
        <img className="bb-preview__pair-back" src={PENALTY_BACK_SRC} alt="" width={size} height={size} />
        <figcaption>Back mark, {size}px</figcaption>
      </figure>
    </div>
  );
}

export function BackButtonPreviewPage() {
  return (
    <main className="bb-preview">
      <p className="bb-preview__banner" role="note">
        {PREVIEW_BANNER}
      </p>
      <h1>Back button</h1>
      <p>
        The Back mark is the Advantage badge itself — same blue, yellow and white timer face, same
        black silhouette — with the referee's arm raised in a penalty signal instead of pointing.
        A penalty is a step back, so this pose means Back. The word Back sits under the badge so it
        is easier to read. Screen readers already hear Back from the control's name. The pointing
        logo stays Home.
      </p>
      <p>
        <Link to={BACK_BUTTON_LAYOUT_PREVIEW_PATH}>Open the Instructor header at this window width</Link>
        {' — pinned Back top left, Account top right, logo centered over Advantage.'}
      </p>

      <section aria-label="Side by side with the Home logo">
        <h2>Next to the Home logo</h2>
        <p>Same size, same badge, different pose.</p>
        <SideBySide size={44} />
        <SideBySide size={176} />
      </section>

      <section aria-label="On light and dark headers">
        <h2>On a header, at button size</h2>
        <div className="bb-preview__tones">
          <HeaderSample theme="dark" label="Dark header, 44px mark" />
          <HeaderSample theme="light" label="Light header, 44px mark" />
        </div>
      </section>

      <section aria-label="App header mock">
        <h2>On a tool page header</h2>
        <p>Same tap target and placement as today. The large logo is still Home.</p>
        <div className="bb-preview__app">
          <PlayExitMark to="/coach" />
          <TierHomeMark to="/" />
          <h1 className="bb-preview__app-title">Coaching tools</h1>
          <p className="bb-preview__app-note">Example header. It does not open the real tools page.</p>
        </div>
      </section>
    </main>
  );
}

/** Full-page Instructor header mock so the pinned Back, Account, and centered
 *  Home logo can be checked at any window width without opening a paid door. */
export function BackButtonLayoutPreviewPage() {
  return (
    <>
      <p className="bb-preview__banner bb-preview-layout__banner" role="note">
        Preview only. Instructor header at this window width. Nothing here is live until you
        approve it.
      </p>
      <div className="home home--pro home--suite">
        <div className="home__inner">
          <PlayExitMark to={BACK_BUTTON_PREVIEW_PATH} />
          <HomeMark
            to="/"
            motto="Win by Advantage"
            tagline="Example layout. Not a live academy."
          />
          <section className="suite instructor-hub">
            <BeltHeader kind="brown" worn title="Instructor Edition" />
            <div className="bb-preview__example-card">
              <p>Example instructor profile</p>
              <p>
                The logo stays centered over Advantage. Back stays top left. Account stays top
                right. Scroll the page: Back and Account stay in the corners.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
