import { Link } from 'react-router-dom';
import { BackButton, type BackButtonTone } from '../../components/BackButton';
import { PlayExitMark } from '../../components/PlayExitMark';
import { TierHomeMark } from '../../components/TierHomeMark';
import './backButtonPreview.css';

export const BACK_BUTTON_PREVIEW_PATH = '/preview/back-button';

const PREVIEW_BANNER = 'Preview only. Nothing here is live until you approve it.';

function HeaderSample({
  tone,
  theme,
  label,
}: {
  tone: BackButtonTone;
  theme: 'dark' | 'light';
  label: string;
}) {
  return (
    <div className={`bb-preview__header bb-preview__header--${theme}`}>
      <Link className="play-exit" to="/" aria-label="Back">
        <BackButton tone={tone} />
      </Link>
      <p className="bb-preview__header-label">{label}</p>
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
        The corner Back control uses the referee penalty signal — a raised fist — because a penalty
        is a step back. A small back arrow sits under the figure, not beside the fist. The Advantage
        logo stays Home, centered over the wordmark in the left column. Back is pinned top left and
        Account is pinned top right, and neither one moves the Home logo.
      </p>

      <section aria-label="Primary penalty red">
        <h2>Primary: muted penalty red</h2>
        <div className="bb-preview__tones">
          <HeaderSample tone="penalty" theme="dark" label="Dark header, 44px mark" />
          <HeaderSample tone="penalty" theme="light" label="Light header, 44px mark" />
        </div>
      </section>

      <section aria-label="Alternate navy">
        <h2>Alternate: navy and cream</h2>
        <div className="bb-preview__tones">
          <HeaderSample tone="navy" theme="dark" label="Dark header, navy control" />
          <HeaderSample tone="navy" theme="light" label="Light header, navy control" />
        </div>
      </section>

      <section aria-label="Zoomed pose">
        <h2>Zoomed, so the pose is clear</h2>
        <div className="bb-preview__zoom">
          <div className="bb-preview__zoom-item">
            <BackButton tone="penalty" />
            <p>Penalty red</p>
          </div>
          <div className="bb-preview__zoom-item">
            <BackButton tone="navy" />
            <p>Navy</p>
          </div>
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
