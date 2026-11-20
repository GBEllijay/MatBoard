/**
 * No-login Identity card preview. Fictional academy data only.
 * Does not read or write gymProfile / localStorage.
 */
import { useMemo, useState } from 'react';
import { AcademyBeltChain } from '../../components/AcademyBeltChain.tsx';
import { AcademyFounders } from '../../components/AcademyFounders.tsx';
import { AcademyLineageEditor } from '../../components/AcademyLineageEditor.tsx';
import { academyMonogram, formatFoundedDate, type FoundersStyle, type LineageStyle } from '../../lib/academyIdentity.ts';
import '../../components/gymSheet.css';
import './academyIdentity.css';
import {
  ACADEMY_IDENTITY_PATH,
  FOUNDERS_STYLE_OPTIONS,
  LINEAGE_DEMO_OPTIONS,
  LINEAGE_STYLE_OPTIONS,
  PREVIEW_ACADEMY,
  PREVIEW_BANNER,
  PREVIEW_FOUNDED,
  PREVIEW_FOUNDERS,
  PREVIEW_SUGGESTIONS,
  PREVIEW_SYNC_LABEL,
  previewLineageText,
  type LineageDemo,
} from './model.ts';

export { ACADEMY_IDENTITY_PATH };

export function AcademyIdentityPreview() {
  const [foundersStyle, setFoundersStyle] = useState<FoundersStyle>('nameplates');
  const [lineageStyle, setLineageStyle] = useState<LineageStyle>('rail');
  const [demo, setDemo] = useState<LineageDemo>('short');
  const [lineageDraft, setLineageDraft] = useState(previewLineageText('edit'));
  const [foundersDraft, setFoundersDraft] = useState(PREVIEW_FOUNDERS);
  const founded = formatFoundedDate(PREVIEW_FOUNDED);
  const monogram = academyMonogram(PREVIEW_ACADEMY);
  const lineage = demo === 'edit' ? lineageDraft : previewLineageText(demo);
  const showLineage = demo !== 'off' && lineage.trim().length > 0;
  const suggestions = useMemo(() => (demo === 'edit' ? PREVIEW_SUGGESTIONS : []), [demo]);

  return (
    <main className="aid-preview" data-testid="academy-identity-preview">
      <div className="aid-preview__bar">
        <p className="aid-preview__banner" role="note">
          <span className="aid-preview__badge">Preview data</span>
          {PREVIEW_BANNER}
        </p>
        <div className="aid-preview__group">
          <p className="aid-preview__label">Founders style</p>
          <div className="aid-preview__pills" role="group" aria-label="Founders style">
            {FOUNDERS_STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={foundersStyle === option.id}
                data-testid={`founders-style-${option.id}`}
                onClick={() => setFoundersStyle(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="aid-preview__group">
          <p className="aid-preview__label">Lineage style</p>
          <div className="aid-preview__pills" role="group" aria-label="Lineage style">
            {LINEAGE_STYLE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={lineageStyle === option.id}
                data-testid={`lineage-style-${option.id}`}
                onClick={() => setLineageStyle(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="aid-preview__group">
          <p className="aid-preview__label">Lineage state</p>
          <div className="aid-preview__pills" role="group" aria-label="Lineage state">
            {LINEAGE_DEMO_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={demo === option.id}
                data-testid={`lineage-demo-${option.id}`}
                onClick={() => {
                  setDemo(option.id);
                  if (option.id === 'edit') setLineageDraft(previewLineageText('edit'));
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="aid-preview__stage">
        <article className="aid-card" aria-label="Gym character sheet">
          <div className="sheet-zone sheet-zone--identity">
            <h3 className="sheet-cap">Identity</h3>
            <div className="gym-id">
              <div className="aid-mono-logo" aria-hidden="true">
                <strong>{monogram}</strong>
                <span>Academy</span>
              </div>
              <div>
                <h2>{PREVIEW_ACADEMY}</h2>
                <p data-testid="academy-sync-label">{PREVIEW_SYNC_LABEL}</p>
                {founded ? <p className="gym-id__founded">{founded.longLabel}</p> : null}
              </div>
            </div>
            <AcademyFounders founders={foundersDraft} foundedOn={PREVIEW_FOUNDED} style={foundersStyle} />
            {showLineage ? (
              <AcademyBeltChain
                lineage={lineage}
                gymName={PREVIEW_ACADEMY}
                example={demo === 'short' || demo === 'long'}
                style={lineageStyle}
              />
            ) : null}
            <button type="button" className="gym-edit" data-testid="academy-edit" onClick={() => setDemo('edit')}>
              ✎ Edit academy profile
            </button>
            {demo === 'edit' ? (
              <form className="gym-fields" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Founders
                  <input value={foundersDraft} maxLength={120} onChange={(event) => setFoundersDraft(event.target.value)} />
                </label>
                <div className="gym-lineage">
                  <p className="gym-sheet__note">
                    Teaching ancestry of this academy: who it was founded under, and who that teacher was under. Not instructors who have taught or visited.
                  </p>
                  <AcademyLineageEditor value={lineageDraft} onChange={setLineageDraft} initialSuggestions={suggestions} />
                  <label>
                    Lineage
                    <textarea
                      aria-label="Lineage"
                      value={lineageDraft}
                      maxLength={240}
                      onChange={(event) => setLineageDraft(event.target.value)}
                    />
                  </label>
                </div>
              </form>
            ) : null}
          </div>
        </article>
      </div>
    </main>
  );
}
