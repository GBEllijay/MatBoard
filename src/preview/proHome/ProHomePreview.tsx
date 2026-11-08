import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import { BeltRail } from '../../components/BeltRail';
import { HomeMark } from '../../components/HomeMark';
import { PRODUCTS_PATH } from '../../lib/productNames';
import {
  INSTRUCTOR_CARDS_PREVIEW_PATH,
  JOURNAL_DESTINATION,
  MEDIA_EXAMPLE,
  MEDIA_PREVIEW_LABEL,
  PREVIEW_BANNER,
  PRODUCTION_WHITE_GAP,
  PRO_PREVIEW_PATH,
  previewProHubs,
  previewWhitePaths,
  productionWhitePaths,
  referenceProHubs,
} from './model';
import './proHome.css';

/**
 * Cream Pro hub. Live Pro is not this page.
 * `?reference=before` is the four original tiles, including the Media Console label.
 */
export function ProHomePreviewPage() {
  const [params] = useSearchParams();
  const before = params.get('reference') === 'before';
  const hubs = before ? referenceProHubs() : previewProHubs();
  const whitePaths = previewWhitePaths();
  const [profileNote, setProfileNote] = useState('');
  const [uploadNote, setUploadNote] = useState('');

  return (
    <main className="php">
      <div className={before ? 'php-shell' : 'php-shell php-pro'}>
        {before ? (
          <p className="php-banner" role="note">
            {PREVIEW_BANNER}
          </p>
        ) : null}
        {before ? (
          <>
            <p className="php-kicker">Reference</p>
            <h1>Pro hubs before the two shortcuts</h1>
          </>
        ) : (
          <Link className="play-exit" to={PRODUCTS_PATH} aria-label="Back">
            <img src="/advantage-icon.png" alt="" width={44} height={44} />
          </Link>
        )}
        {before ? null : <HomeMark />}
        <p className="php-note" data-testid="preview-path">
          {before ? `${PRO_PREVIEW_PATH}?reference=before` : PRO_PREVIEW_PATH}
        </p>
        <BeltHeader kind="black" worn title="Advantage Pro" blurb="Example only. Not a saved gym." />
        {before ? null : (
          <>
            <section className="php-gym" aria-label="Gym identity" data-testid="pro-gym-identity">
              <p className="php-gym__cap">Identity</p>
              <div className="php-gym__row">
                <img src="/advantage-icon.png" alt="" width={56} height={56} />
                <div>
                  <h2>{MEDIA_EXAMPLE.gym}</h2>
                  <p>Founded 2014</p>
                  <p>Founders Example Founders (fictional)</p>
                  <p>Lineage Example lineage (fictional)</p>
                </div>
              </div>
              <button type="button" onClick={() => setProfileNote('Example only. This does not edit a saved academy.')}>
                {profileNote || 'Edit academy profile'}
              </button>
            </section>
            <section className="php-cloud" aria-label="Cloud status" data-testid="pro-cloud-status">
              <h2>Advantage Cloud</h2>
              <p>Example only. Not connected. This is not a live Advantage Cloud check.</p>
            </section>
            <section className="php-upload" aria-label="Upload daily videos">
              <h2>Upload daily videos</h2>
              <p>Example only. Nothing is uploaded.</p>
              <div className="php-upload__actions">
                <button type="button" onClick={() => setUploadNote('videos')}>
                  Upload daily videos
                </button>
                <button type="button" onClick={() => setUploadNote('lesson')}>
                  Upload lesson-plan media
                </button>
              </div>
              {uploadNote ? <p>Example only. Nothing was uploaded.</p> : null}
            </section>
            <p className="php-banner" role="note">
              {PREVIEW_BANNER}
            </p>
          </>
        )}
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
                These three open the same preview White hub. That hub links to the suite scoreboard and the suite round timer.
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
            <p className="php-note">Journal shortcut opens {JOURNAL_DESTINATION}. It does not write a belt or a journal.</p>
            <Link className="php-jump" to={INSTRUCTOR_CARDS_PREVIEW_PATH}>
              Instructor card concept, separate preview
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
