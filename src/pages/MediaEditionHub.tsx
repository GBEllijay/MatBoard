import { useEffect } from 'react';
import { BeltHeader } from '../components/BeltHeader';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { SuiteMenuLinks } from '../components/SuiteMenuLinks';
import { MEDIA_EDITION_MENU, PRODUCTS_PATH } from '../lib/productNames';
import './mediaEdition.css';

export const MEDIA_EDITION_HUB_TITLE = 'Advantage Media Edition';

/**
 * Unlocked /media: a clean menu only. The purple belt titled Advantage Media
 * Edition, then three stacked /suite buttons: Scoreboard, Round Timer, Media
 * Console. No gallery or folder tiles here; those live in the Media Console.
 */
export function MediaEditionHubPage() {
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
        <SiteFooter />
      </div>
    </main>
  );
}
