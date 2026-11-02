import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { SuiteMenuLinks } from '../components/SuiteMenuLinks';
import { useSeatDoor } from '../hooks/useSeatDoor';
import { lockMedia } from '../lib/mediaUnlock';
import { MEDIA_EDITION_MENU, PRODUCTS_PATH } from '../lib/productNames';
import './mediaEdition.css';

export const MEDIA_EDITION_HUB_TITLE = 'Advantage Media Edition';

/**
 * Unlocked /media: a clean menu only. The purple belt titled Advantage Media
 * Edition, then three stacked /suite buttons: Scoreboard, Round Timer, Media
 * Console. No gallery or folder tiles here; those live in the Media Console.
 * Opens for a Media pass, Pro, or owner (Pro keeps /pro too). Lock Media sits
 * under the menu when this browser holds the Media door.
 */
export function MediaEditionHubPage() {
  const door = useSeatDoor();
  const navigate = useNavigate();
  useEffect(() => {
    const previous = document.title;
    document.title = MEDIA_EDITION_HUB_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <main className="home home--pro home--suite home--media-hub">
      <div className="home__inner">
        <HomeMark to={PRODUCTS_PATH} />
        <section className="suite">
          <BeltHeader kind="purple" title={MEDIA_EDITION_HUB_TITLE} />
          <SuiteMenuLinks links={MEDIA_EDITION_MENU} label="Advantage Media Edition menu" />
        </section>
        {!door.seated && door.mediaUnlocked ? (
          <div className="home__hints">
            <p className="home__soon">
              Advantage Media Edition is on for this browser.{' '}
              <Link className="home__text-btn" to={PRODUCTS_PATH}>
                All products
              </Link>
              {' · '}
              <button
                type="button"
                className="home__text-btn"
                onClick={() => {
                  lockMedia();
                  navigate(PRODUCTS_PATH);
                }}
              >
                Lock Media
              </button>
            </p>
          </div>
        ) : null}
        <SiteFooter />
      </div>
    </main>
  );
}
