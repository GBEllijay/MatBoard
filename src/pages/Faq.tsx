import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import {
  FAQ_ALL,
  FAQ_ENTRIES,
  faqHref,
  filterFaq,
  faqCategories,
  type FaqEntry,
} from '../lib/faq';
import { PRODUCTS_PATH } from '../lib/productNames';
import { StudentMarks, useStudentPath } from './student/chrome';
import './faq.css';

const WELCOME =
  'Welcome. If you already train, start with the belt you wear now. A full promotion history is optional, and a small number of logged hours is not your lifetime on the mat.';

export function FaqPage() {
  return (
    <main className="faq-page">
      <HomeMark to={PRODUCTS_PATH} />
      <FaqBoard to={(path) => faqHref(path, true)} />
      <SiteFooter />
    </main>
  );
}

/** Same answers inside Student Edition, so Back returns to the student hub. */
export function StudentFaqPage() {
  const to = useStudentPath();
  return (
    <main className="faq-page">
      <StudentMarks />
      <FaqBoard to={to} />
    </main>
  );
}

export function FaqBoard({ to }: { to: (path: string) => string }) {
  const { hash } = useLocation();
  const searchId = useId();
  const listId = useId();
  const categories = useMemo(() => faqCategories(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(FAQ_ALL);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(['start-with-your-belt']));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = useMemo(() => filterFaq(FAQ_ENTRIES, query, category), [query, category]);

  useEffect(() => {
    if (!query.trim()) return;
    const matches = filterFaq(FAQ_ENTRIES, query, category);
    if (matches.length > 0 && matches.length <= 4) setOpen(new Set(matches.map((entry) => entry.id)));
  }, [query, category]);

  useEffect(() => {
    const id = hash.startsWith('#') ? decodeHash(hash.slice(1)) : '';
    if (!id || !visible.some((entry) => entry.id === id)) return;
    setOpen((current) => new Set(current).add(id));
    const node = document.getElementById(`faq-${id}`);
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' });
  }, [hash, visible]);

  const move = (index: number, key: string) => {
    const last = visible.length - 1;
    if (last < 0) return;
    let next = index;
    if (key === 'ArrowDown') next = index >= last ? 0 : index + 1;
    else if (key === 'ArrowUp') next = index <= 0 ? last : index - 1;
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = last;
    else return;
    buttons.current[next]?.focus();
  };

  let cursor = 0;

  return (
    <div className="faq">
      <header>
        <p className="faq__kicker">Advantage</p>
        <h1>FAQ</h1>
        <p className="faq__lead">{WELCOME}</p>
      </header>
      <div className="faq__tools">
        <label className="faq__search" htmlFor={searchId}>
          <span>Search questions</span>
          <input
            id={searchId}
            type="search"
            role="searchbox"
            placeholder="Search questions"
            value={query}
            autoComplete="off"
            aria-controls={listId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                setQuery('');
              }
            }}
          />
        </label>
        <div className="faq__topics" role="toolbar" aria-label="Topics">
          {[FAQ_ALL, ...categories].map((name) => (
            <button
              key={name}
              type="button"
              className="faq__topic"
              aria-pressed={category === name}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="faq__count" role="status" aria-live="polite">
          {visible.length === 1 ? '1 question' : `${visible.length} questions`}
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="faq__empty" role="status">
          No questions match that. Try mat hours, backup, rank, or academy.
        </p>
      ) : (
        <div id={listId}>
          {groupVisible(visible).map((group) => (
            <section key={group.category} className="faq__group" aria-label={group.category}>
              <h2>{group.category}</h2>
              {group.entries.map((entry) => {
                const index = cursor;
                cursor += 1;
                const expanded = open.has(entry.id);
                const panelId = `faq-${entry.id}-answer`;
                return (
                  <article key={entry.id} id={`faq-${entry.id}`} className="faq__item">
                    <h3>
                      <button
                        type="button"
                        className="faq__q"
                        ref={(node) => {
                          buttons.current[index] = node;
                        }}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => {
                          setOpen((current) => {
                            const next = new Set(current);
                            if (next.has(entry.id)) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && expanded) {
                            event.preventDefault();
                            setOpen((current) => {
                              const next = new Set(current);
                              next.delete(entry.id);
                              return next;
                            });
                            return;
                          }
                          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
                            event.preventDefault();
                            move(index, event.key);
                          }
                        }}
                      >
                        <span>{entry.question}</span>
                        <span className="faq__chev" aria-hidden="true">
                          {expanded ? '−' : '+'}
                        </span>
                      </button>
                    </h3>
                    <div id={panelId} className="faq__a" role="region" aria-label={entry.question} hidden={!expanded}>
                      <div className="faq__a-card">
                        {entry.paragraphs.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                        {entry.steps ? (
                          <ol>
                            {entry.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        ) : null}
                        {entry.links?.length ? (
                          <div className="faq__links">
                            {entry.links.map((link) => (
                              <Link key={link.to + link.label} to={to(link.to)}>
                                {link.label}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupVisible(entries: readonly FaqEntry[]): { category: string; entries: FaqEntry[] }[] {
  const groups: { category: string; entries: FaqEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.category === entry.category) last.entries.push(entry);
    else groups.push({ category: entry.category, entries: [entry] });
  }
  return groups;
}

function decodeHash(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
