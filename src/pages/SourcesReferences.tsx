import { Link } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { PRODUCTS_PATH } from '../lib/productNames';
import { TEACHING_DISCLAIMER, TEACHING_SUGGESTIONS } from '../lib/teachingLineage';
import './faq.css';

/** Short notes for the checked teaching suggestions. Not a biography and not legal terms. */
export function SourcesReferencesPage() {
  return (
    <main className="faq-page">
      <HomeMark to={PRODUCTS_PATH} />
      <article className="faq-board" aria-label="Sources and references" data-testid="sources-page">
        <h1>Sources & references</h1>
        <p>{TEACHING_DISCLAIMER}</p>
        <p>These notes were checked on 8 November 2026. They are not a license to copy the pages they cite.</p>
        {TEACHING_SUGGESTIONS.map((item) => (
          <section key={item.id}>
            <h2>
              {item.person} → {item.nextTeacher}
            </h2>
            <p>{item.summary}</p>
            <ul>
              {item.urls.map((url) => (
                <li key={url}>
                  <a href={url}>{url}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <Link to="/faq">FAQ</Link>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
