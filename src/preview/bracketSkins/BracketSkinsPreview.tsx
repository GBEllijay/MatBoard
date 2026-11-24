import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../../components/BeltRail';
import { PlayExitMark } from '../../components/PlayExitMark';
import { BracketSkinDeco, BracketSkinLinks, useBracketSkin } from '../../components/BracketSkin';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { usePlayFullscreen } from '../../hooks/usePlayFullscreen';
import { BRACKET_SKIN_SLUGS, bracketSkinClasses } from '../../lib/bracketSkins';
import { BRACKET_THEME_LABELS } from '../../lib/bracketTheme';
import { bracketSkinsPreviewOpen } from '../../lib/bracketSkins';
import type { PolishedTimerSlug } from '../../lib/polishedSkins';
import { sampleBracket, sampleSize, type SampleBracket, type SampleSlot } from '../../lib/bracketSkinsSample';
import { BRACKET_SKIN_THUMBS } from '../../skins/bracket/thumbs';
import '../../pages/tournamentBoard.css';
import './bracketSkinsPreview.css';

/**
 * Owner review of the 16 bracket skins on the live 8-person tree markup.
 * Fictional names only, kept in memory. Nothing is read from or written to the
 * saved bracket, the roster, the match link or any unlock flag.
 * Open only on Cloudflare Pages previews and local dev; production shows a note.
 */
export const BRACKET_SKINS_PREVIEW_PATH = '/preview/bracket-skins';


function previewOpenHere(): boolean {
  return typeof window !== 'undefined' && bracketSkinsPreviewOpen(window.location.hostname);
}

function Slot({ slot }: { slot: SampleSlot }) {
  const cls = `t-slot${slot.mark === 'won' ? ' t-slot--won' : ''}${slot.mark === 'lost' ? ' t-slot--lost' : ''}${slot.seed ? ' t-slot--seed' : ''}`;
  return (
    <div className={cls}>
      <div className="t-slot__who">
        {slot.seed ? <span className="t-slot__seed">{slot.seed}.</span> : null}
        <div className="t-slot__name">
          <div className="roster-field roster-field--compact">
            <div className="roster-field__row">
              <input value={slot.name} placeholder={slot.seed ? 'TBD' : 'Winner'} readOnly tabIndex={-1} aria-label="Sample competitor" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Match({ id, sample }: { id: string; sample: SampleBracket }) {
  const m = sample.matches[id];
  const final = id === 'final-0';
  return (
    <article
      data-match-id={id}
      className={`t-match${final ? ' t-match--final' : ''}${m.live ? ' t-match--live' : ''}${m.done ? ' t-match--done' : ''}`}
    >
      {m.live ? <p className="t-live-pill">LIVE</p> : null}
      {final ? (
        <p className="t-match__finals-label">
          <span>Championship match</span>
          <strong>Finals</strong>
        </p>
      ) : null}
      <div className="t-match__bouts">
        <Slot slot={m.a} />
        <Slot slot={m.b} />
      </div>
    </article>
  );
}

function Round({ ids, label, sample }: { ids: string[]; label: string; sample: SampleBracket }) {
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>
        <span>{label}</span>
      </h2>
      <div className="bracket__matches">
        {ids.map((id) => (
          <Match key={id} id={id} sample={sample} />
        ))}
      </div>
    </div>
  );
}

/** The live toolbar, painted by the skin. Buttons are inert here; the Division field names the preview. */
function SampleTools({ slug, sample }: { slug: PolishedTimerSlug; sample: SampleBracket }) {
  const buttons = ['Current match', String(sample.size), 'Save', 'Edit names', 'Fill from check-in', 'Undo last result', 'Reset'];
  return (
    <div className="tournament__tools" aria-label="Bracket controls (preview, inert)">
      <div className="tournament__center">
        <p className="tournament__roundline">{sample.roundLine}</p>
        <label className="tournament__title">
          <span>Division</span>
          <input value={`Preview · ${BRACKET_THEME_LABELS[slug]} · fictional names`} readOnly tabIndex={-1} aria-label="Division or class name" />
        </label>
      </div>
      <div className="tournament__actions">
        <div className="kids-skin">
          <button type="button" className="btn kids-skin__btn btn--ghost" disabled>
            Skins
          </button>
        </div>
        <button type="button" className="chip chip--on" disabled>
          TV Clean
        </button>
        {buttons.map((label) => (
          <button key={label} type="button" className={`btn ${label === 'Undo last result' ? 'btn--blue' : 'btn--ghost'}`} disabled>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One skin, full window, with the live page's Back mark and toolbar. The gallery frames this at 1920x1080 and 390x844. */
export function BracketSkinSample({ slug, size = 8 }: { slug: PolishedTimerSlug; size?: 8 | 16 }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const fs = usePlayFullscreen({ auto: false });
  const skin = useBracketSkin(slug);
  const sample = sampleBracket(size);
  usePinchZoom(boardRef, bracketRef, { fitKey: `${slug}-${size}-${skin ? 1 : 0}` });
  return (
    <main
      className={`tournament ${bracketSkinClasses(slug)} tournament--clean bskin-preview${fs.className ? ` ${fs.className}` : ''}`}
      data-skin={slug}
      data-size={size}
      data-ready={skin ? 'true' : 'false'}
    >
      {skin ? <BracketSkinDeco html={skin.deco} /> : null}
      <BeltRail kind="tournament" />
      <PlayExitMark to={BRACKET_SKINS_PREVIEW_PATH} />
      <header className="tournament__bar">
        <div className="bracket-headline">
          <label className="bracket-headline__pill">
            <input value="Tournament" readOnly tabIndex={-1} aria-label="Tournament title" />
          </label>
        </div>
      </header>
      <div className="tournament__board" ref={boardRef}>
        <div className="bracket-viewport">
          <div
            className={`bracket bracket--tree-${sample.tree}`}
            ref={bracketRef}
            role="group"
            aria-label={`Sample ${sample.size}-competitor bracket`}
          >
            {skin ? <BracketSkinLinks bracketRef={bracketRef} drawKey={`${slug}-${size}`} /> : null}
            <div className="bracket__side bracket__side--left">
              {sample.left.map((round) => (
                <Round key={`l-${round.label}`} ids={round.ids} label={round.label} sample={sample} />
              ))}
            </div>
            <div className="bracket__finals">
              <Match id="final-0" sample={sample} />
              <div className="bracket__champ">
                <BeltRail kind="tournament" />
                <span>Champion</span>
                <div className="roster-field roster-field--compact">
                  <div className="roster-field__row">
                    <input value="" placeholder="Winner" readOnly tabIndex={-1} aria-label="Champion" />
                  </div>
                </div>
              </div>
            </div>
            <div className="bracket__side bracket__side--right">
              {sample.right.map((round) => (
                <Round key={`r-${round.label}`} ids={round.ids} label={round.label} sample={sample} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <SampleTools slug={slug} sample={sample} />
    </main>
  );
}

function Closed() {
  return (
    <main className="bskin-gallery">
      <h1>Bracket skins preview</h1>
      <p>This review page opens on Cloudflare Pages preview builds only.</p>
    </main>
  );
}

/** /preview/bracket-skins/:slug */
export function BracketSkinSamplePage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  if (!previewOpenHere()) return <Closed />;
  const found = BRACKET_SKIN_SLUGS.find((s) => s === slug);
  if (!found) return <Closed />;
  return <BracketSkinSample slug={found} size={sampleSize(params.get('size'))} />;
}

/** /preview/bracket-skins?view=tv|phone|both&skin=<slug>&size=8|16 */
export function BracketSkinsGalleryPage() {
  const [params] = useSearchParams();
  if (!previewOpenHere()) return <Closed />;
  const view = params.get('view') ?? 'both';
  const only = params.get('skin');
  const size = sampleSize(params.get('size'));
  const q = size === 16 ? '?size=16' : '';
  const link = (extra: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const text = next.toString();
    return `${BRACKET_SKINS_PREVIEW_PATH}${text ? `?${text}` : ''}`;
  };
  const slugs = BRACKET_SKIN_SLUGS.filter((s) => !only || s === only);
  return (
    <main className="bskin-gallery">
      <h1>Bracket skins · {slugs.length} skins · {size} competitors</h1>
      <p>
        Live bracket markup, fictional names. Each frame is a real page at TV 1920×1080 and phone 390×844.{' '}
        <Link to={link({ view: 'tv' })}>TV only</Link> · <Link to={link({ view: 'phone' })}>Phone only</Link> ·{' '}
        <Link to={link({ view: '' })}>Both</Link> · <Link to={link({ size: '' })}>8 competitors</Link> ·{' '}
        <Link to={link({ size: '16' })}>16 competitors</Link>
      </p>
      <div className="bskin-gallery__grid">
        {slugs.map((slug) => (
          <section key={slug} className="bskin-gallery__item">
            <h2>
              <img src={BRACKET_SKIN_THUMBS[slug]} alt="" width={64} height={36} />
              <a href={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}${q}`}>{BRACKET_THEME_LABELS[slug]}</a>
            </h2>
            <div className="bskin-gallery__frames">
              {view !== 'phone' ? (
                <div className="bskin-gallery__frame bskin-gallery__frame--tv">
                  <iframe title={`${slug} TV`} src={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}${q}`} loading="lazy" />
                </div>
              ) : null}
              {view !== 'tv' ? (
                <div className="bskin-gallery__frame bskin-gallery__frame--phone">
                  <iframe title={`${slug} phone`} src={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}${q}`} loading="lazy" />
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
