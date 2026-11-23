import { Link } from 'react-router-dom';
import { useTrainingState } from '../hooks/useStores';
import { roundsCardPreview } from '../lib/roundsCardPreview';
import brasilTimer from '../skins/polished/thumbs/brasil-timer.jpg';
import calcadaoTimer from '../skins/polished/thumbs/calcadao-timer.jpg';
import woodblockTimer from '../skins/polished/thumbs/woodblock-timer.jpg';
import { BeltRail } from './BeltRail';

const ROUNDS_PATH = '/training?from=white';
const CONTROLLER_PATH = '/training/control?from=white';

export function RoundsCard() {
  const training = useTrainingState();
  const preview = roundsCardPreview(training);

  return (
    <article className="mode-card mode-card--training" id="round-timer">
      <BeltRail kind="white" />
      <Link className="mode-card__hit" to={ROUNDS_PATH} tabIndex={-1} aria-label="Open Rounds" />
      <div className="rounds-card__head">
        <div className="rounds-card__titles">
          <strong>Rounds</strong>
          <span className="mode-card__sub">Training Timer</span>
        </div>
        <div className="rounds-card__previews">
          <RoundsTvPreview preview={preview} />
          <Link
            className="rounds-skins"
            to={CONTROLLER_PATH}
            aria-label="Open round timer skins"
            data-rounds-skins="true"
          >
            <span className="rounds-skins__fan" aria-hidden="true">
              <span className="rounds-skins__face rounds-skins__face--paper">
                <img src={woodblockTimer} alt="" />
              </span>
              <span className="rounds-skins__face rounds-skins__face--calcadao">
                <img src={calcadaoTimer} alt="" />
              </span>
              <span className="rounds-skins__face rounds-skins__face--brasil">
                <img src={brasilTimer} alt="" />
              </span>
            </span>
            <span className="rounds-skins__label">Skins</span>
          </Link>
        </div>
      </div>
      <span>
        Round timer for the gym TV. Open it on a computer plugged into the TV, or cast from your
        phone. Set round length, rest time, and how many rounds.
      </span>
      <span className="rounds-card__tagline">Customizable with logo and skins</span>
      <div className="mode-card__actions">
        <Link className="btn" to={ROUNDS_PATH}>
          Rounds
        </Link>
        <Link className="btn btn--ghost" to={CONTROLLER_PATH}>
          Controller
        </Link>
      </div>
    </article>
  );
}

function RoundsTvPreview({ preview }: { preview: ReturnType<typeof roundsCardPreview> }) {
  return (
    <div
      className="rounds-tv"
      data-rounds-tv="true"
      aria-label={`Preview: work ${preview.work}, ${preview.header}, ${preview.restLine}`}
    >
      <div className="rounds-tv__top">
        <img className="rounds-tv__logo" src="/advantage-icon.png" alt="" width={48} height={48} />
        <span className="rounds-tv__header">{preview.header}</span>
      </div>
      <span className="rounds-tv__label">{preview.roundTimeLabel}</span>
      <span className="rounds-tv__time">{preview.work}</span>
      <span className="rounds-tv__rest">{preview.restLine}</span>
    </div>
  );
}
