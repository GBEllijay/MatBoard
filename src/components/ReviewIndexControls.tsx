import { useId, useMemo, useState } from 'react';
import { FUNDAMENTALS_CATALOG } from '../lib/progress/catalog.ts';
import type { StudentProgressReport } from '../lib/progress/types';
import type { AttachReviewNameResult } from '../lib/reviewIndexLink';
import type { ReplayIndexLink } from '../lib/replayAnalysis';
import { techniquePicker } from '../lib/techniqueIndex';

const linkId = (item: { catalogItemId: string; entryId: string }) => item.catalogItemId || item.entryId;

/**
 * Pick a fundamental from the academy index, or add a new name into it.
 * The free-text review label stays on the card beside this control.
 */
export function ReviewIndexControls({
  report,
  link,
  readOnly,
  onPick,
  onAdd,
}: {
  report: StudentProgressReport;
  link?: ReplayIndexLink;
  readOnly: boolean;
  onPick: (link: ReplayIndexLink | null) => void;
  onAdd: (categoryId: string, name: string) => AttachReviewNameResult;
}) {
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [addName, setAddName] = useState('');
  const [categoryId, setCategoryId] = useState(FUNDAMENTALS_CATALOG.categories[0]?.id ?? '');
  const [error, setError] = useState('');
  const categoryLabelId = useId();
  const view = useMemo(() => (picker ? techniquePicker(report, search) : null), [picker, report, search]);

  const openAdd = (name = '') => {
    setAddName(name);
    setError('');
    setPicker(false);
    setAdding(true);
  };

  const confirmAdd = () => {
    const result = onAdd(categoryId, addName);
    if (!result.link) {
      setError(result.error || 'That name could not be added to the index.');
      return;
    }
    onPick(result.link);
    setAdding(false);
    setError('');
  };

  return (
    <div className="replay-index">
      <p className="replay-card__label">Fundamental</p>
      <p className="replay-index__current">{link ? link.name : 'Not on the index yet.'}</p>
      {readOnly ? null : (
        <>
          <div className="replay-card__actions">
            <button type="button" className="btn" onClick={() => { setSearch(''); setError(''); setPicker(true); setAdding(false); }}>
              Pick from index
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => openAdd(link?.name ?? '')}>
              Add a new fundamental
            </button>
            {link ? (
              <button type="button" className="btn btn--ghost" onClick={() => onPick(null)}>
                Clear fundamental
              </button>
            ) : null}
          </div>
          {picker && view ? (
            <div className="replay-index__picker" role="dialog" aria-label="Pick a fundamental">
              <button type="button" className="btn btn--ghost" onClick={() => setPicker(false)}>
                Close
              </button>
              <label className="replay-card__label">
                Search
                <input
                  type="search"
                  aria-label="Search the fundamentals index"
                  value={search}
                  placeholder="Fundamentals and my techniques"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {view.categories.map((category) => (
                <section key={category.id}>
                  <h3 className="replay-index__category">{category.name}</h3>
                  {category.items.map((item) => (
                    <button
                      key={`${item.catalogItemId}-${item.entryId}-${item.name}`}
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        const id = linkId(item);
                        if (!id) return;
                        onPick({ id, name: item.label });
                        setPicker(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </section>
              ))}
              {view.mine.length ? (
                <section aria-label="My techniques">
                  <h3 className="replay-index__category">My techniques</h3>
                  <p className="replay-card__note">These names are on journal cards. Add one to the fundamentals index to link this review.</p>
                  {view.mine.map((name) => (
                    <button key={name} type="button" className="btn btn--ghost" onClick={() => openAdd(name)}>
                      {`Add ${name} to the index`}
                    </button>
                  ))}
                </section>
              ) : null}
              {!view.categories.length && !view.mine.length ? <p className="replay-card__note">No techniques match.</p> : null}
            </div>
          ) : null}
          {adding ? (
            <div className="replay-index__add">
              <label className="replay-card__label">
                Name
                <input
                  aria-label="New fundamental name"
                  value={addName}
                  maxLength={80}
                  onChange={(event) => setAddName(event.target.value)}
                />
              </label>
              <p className="replay-card__label" id={categoryLabelId}>Category</p>
              <div className="replay-index__categories" role="group" aria-labelledby={categoryLabelId}>
                {FUNDAMENTALS_CATALOG.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={category.id === categoryId ? 'btn' : 'btn btn--ghost'}
                    aria-pressed={category.id === categoryId}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              <div className="replay-card__actions">
                <button type="button" className="btn" onClick={confirmAdd}>
                  Add to index
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => { setAdding(false); setError(''); }}>
                  Cancel
                </button>
              </div>
              {error ? (
                <p className="replay-card__note" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
