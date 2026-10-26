import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';
import { HomeMark } from './HomeMark';
import { SiteFooter } from './SiteFooter';

type Props = {
  title: string;
  updated: string;
  related: { to: string; label: string };
  children: ReactNode;
};

export function LegalPage({ title, updated, related, children }: Props) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="home home--legal">
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="legal">
          <header className="legal__header">
            <h2>{title}</h2>
            <p className="legal__updated">Last updated: {updated}</p>
            <p className="legal__related">
              <Link to={related.to}>{related.label}</Link>
            </p>
          </header>
          {children}
          <nav className="legal__actions" aria-label="Legal">
            <Link className="btn btn--ghost" to="/">
              Back to home
            </Link>
            <Link className="btn btn--ghost" to={related.to}>
              {related.label}
            </Link>
          </nav>
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

export function LegalContact() {
  return (
    <p>
      Advantage App, LLC
      <br />
      Website: <a href="https://advantagebjjtimer.com">https://advantagebjjtimer.com</a>
      <br />
      Email: <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
    </p>
  );
}
