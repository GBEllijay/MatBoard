import { Link, useSearchParams } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import { BeltRail } from '../../components/BeltRail';
import {
  INSTRUCTOR_CARDS_PREVIEW_PATH,
  JOURNAL_DESTINATION,
  MEDIA_PREVIEW_LABEL,
  PREVIEW_BANNER,
  PRODUCTION_WHITE_GAP,
  PRO_PREVIEW_PATH,
  SKINS_TIMER,
  previewProHubs,
  previewWhitePaths,
  productionWhitePaths,
  referenceProHubs,
} from './model';
import './proHome.css';

/**
 * Cream Pro hub, plus the two shortcuts. Live Pro is not this page.
 * `?reference=before` is the four original tiles, including the Media Console label.
 */
export function ProHomePreviewPage() {
  const [params] = useSearchParams();
  const before = params.get('reference') === 'before';
  const hubs = before ? referenceProHubs() : previewProHubs();
  const whitePaths = previewWhitePaths();

  return (
    <main className="php">
      <div className="php-shell">
        <p className="php-banner" role="note">
          {PREVIEW_BANNER}
        </p>
        <p className="php-kicker">{before ? 'Reference' : 'Pro preview'}</p>
        <h1>{before ? 'Pro hubs before the two shortcuts' : 'Pro home'}</h1>
        <p className="php-note" data-testid="preview-path">
          {before ? `${PRO_PREVIEW_PATH}?reference=before` : PRO_PREVIEW_PATH}
        </p>
        <BeltHeader kind="black" worn title="Advantage Pro" blurb="Example only. Not a saved gym." />
        <nav className="php-hubs" aria-label={before ? 'Reference Pro hubs' : 'Preview Pro hubs'}>
          {hubs.map((hub) => (
            <Link
              key={hub.title}
              className="php-tile"
              to={hub.to}
              data-belt={hub.belt}
              data-white-path={hub.whitePath}
              data-testid={hub.title === MEDIA_PREVIEW_LABEL || hub.title === 'Media Console' ? 'media-hub' : undefined}
            >
              <BeltRail kind={hub.belt} />
              <span className="php-tile__copy">
                <strong>{hub.title}</strong>
                {hub.note ? <small>{hub.note}</small> : null}
              </span>
            </Link>
          ))}
        </nav>
        {before ? null : (
          <>
            <section className="php-gap" aria-label="White paths">
              <h2>White paths in this preview</h2>
              <p className="php-note">
                These three open the same skins-enabled scoreboard. The round timer for that suite is{' '}
                <Link to={SKINS_TIMER}>{SKINS_TIMER}</Link>.
              </p>
              <ul>
                {whitePaths.map((path) => (
                  <li key={path.id}>
                    <Link to={path.to} data-white-path={path.id}>
                      {path.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <h2>Live app, not changed</h2>
              <ul>
                {productionWhitePaths().map((path) => (
                  <li key={path.id}>
                    {path.label}: {path.to}
                  </li>
                ))}
                {PRODUCTION_WHITE_GAP.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            <p className="php-note">
              Journal shortcut opens {JOURNAL_DESTINATION}. It does not write a belt or a journal.
            </p>
            <Link className="php-jump" to={INSTRUCTOR_CARDS_PREVIEW_PATH}>
              Instructor card concept, separate preview
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
