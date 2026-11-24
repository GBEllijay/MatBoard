import { useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../../components/BeltRail';
import { BracketSkinDeco, BracketSkinLinks, useBracketSkin } from '../../components/BracketSkin';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { usePlayFullscreen } from '../../hooks/usePlayFullscreen';
import { BRACKET_SKIN_SLUGS, bracketSkinClasses } from '../../lib/bracketSkins';
import { BRACKET_THEME_LABELS } from '../../lib/bracketTheme';
import { bracketSkinsPreviewOpen } from '../../lib/bracketSkins';
import type { PolishedTimerSlug } from '../../lib/polishedSkins';
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

type SampleSlot = { name: string; seed?: number; mark?: 'won' | 'lost' };
type SampleMatch = { id: string; a: SampleSlot; b: SampleSlot; done?: boolean; live?: boolean };

/** Fictional board: three quarterfinals scored, the fourth live. */
export const SAMPLE_MATCHES: Record<string, SampleMatch> = {
  'qf-0': { id: 'qf-0', done: true, a: { name: 'David', seed: 1, mark: 'won' }, b: { name: 'Nathan', seed: 8, mark: 'lost' } },
  'qf-1': { id: 'qf-1', done: true, a: { name: 'Beth', seed: 4, mark: 'won' }, b: { name: 'Matthew', seed: 5, mark: 'lost' } },
  'qf-2': { id: 'qf-2', done: true, a: { name: 'Jon', seed: 2, mark: 'won' }, b: { name: 'Shaun', seed: 7, mark: 'lost' } },
  'qf-3': { id: 'qf-3', live: true, a: { name: 'Anna', seed: 3 }, b: { name: 'Ken', seed: 6 } },
  'sf-0': { id: 'sf-0', a: { name: 'David' }, b: { name: 'Beth' } },
  'sf-1': { id: 'sf-1', a: { name: 'Jon' }, b: { name: '' } },
  'final-0': { id: 'final-0', a: { name: '' }, b: { name: '' } },
};

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

function Match({ id }: { id: string }) {
  const m = SAMPLE_MATCHES[id];
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

function Round({ ids, label }: { ids: string[]; label: string }) {
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>
        <span>{label}</span>
      </h2>
      <div className="bracket__matches">
        {ids.map((id) => (
          <Match key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

/** One skin, full window. The gallery frames this at 1920x1080 and 390x844. */
export function BracketSkinSample({ slug }: { slug: PolishedTimerSlug }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const fs = usePlayFullscreen({ auto: false });
  const skin = useBracketSkin(slug);
  usePinchZoom(boardRef, bracketRef, { fitKey: `${slug}-${skin ? 1 : 0}` });
  return (
    <main
      className={`tournament ${bracketSkinClasses(slug)} tournament--clean bskin-preview${fs.className ? ` ${fs.className}` : ''}`}
      data-skin={slug}
      data-ready={skin ? 'true' : 'false'}
    >
      {skin ? <BracketSkinDeco html={skin.deco} /> : null}
      <BeltRail kind="tournament" />
      <header className="tournament__bar">
        <div className="bracket-headline">
          <label className="bracket-headline__pill">
            <input value="Tournament" readOnly tabIndex={-1} aria-label="Tournament title" />
          </label>
        </div>
      </header>
      <div className="tournament__board" ref={boardRef}>
        <div className="bracket-viewport">
          <div className="bracket bracket--tree-8" ref={bracketRef} role="group" aria-label="Sample 8-competitor bracket">
            {skin ? <BracketSkinLinks bracketRef={bracketRef} drawKey={slug} /> : null}
            <div className="bracket__side bracket__side--left">
              <Round ids={['qf-0', 'qf-1']} label="Quarterfinals" />
              <Round ids={['sf-0']} label="Semifinals" />
            </div>
            <div className="bracket__finals">
              <Match id="final-0" />
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
              <Round ids={['sf-1']} label="Semifinals" />
              <Round ids={['qf-2', 'qf-3']} label="Quarterfinals" />
            </div>
          </div>
        </div>
      </div>
      <p className="bskin-preview__tag">
        Preview · {BRACKET_THEME_LABELS[slug]} · fictional names
      </p>
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
  if (!previewOpenHere()) return <Closed />;
  const found = BRACKET_SKIN_SLUGS.find((s) => s === slug);
  if (!found) return <Closed />;
  return <BracketSkinSample slug={found} />;
}

/** /preview/bracket-skins?view=tv|phone|both&skin=<slug> */
export function BracketSkinsGalleryPage() {
  const [params] = useSearchParams();
  if (!previewOpenHere()) return <Closed />;
  const view = params.get('view') ?? 'both';
  const only = params.get('skin');
  const slugs = BRACKET_SKIN_SLUGS.filter((s) => !only || s === only);
  return (
    <main className="bskin-gallery">
      <h1>Bracket skins · {slugs.length} skins</h1>
      <p>
        Live 8-person tree, fictional names. Each frame is a real page at TV 1920×1080 and phone 390×844.{' '}
        <Link to={`${BRACKET_SKINS_PREVIEW_PATH}?view=tv`}>TV only</Link> ·{' '}
        <Link to={`${BRACKET_SKINS_PREVIEW_PATH}?view=phone`}>Phone only</Link> ·{' '}
        <Link to={BRACKET_SKINS_PREVIEW_PATH}>Both</Link>
      </p>
      <div className="bskin-gallery__grid">
        {slugs.map((slug) => (
          <section key={slug} className="bskin-gallery__item">
            <h2>
              <img src={BRACKET_SKIN_THUMBS[slug]} alt="" width={64} height={36} />
              <a href={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}`}>{BRACKET_THEME_LABELS[slug]}</a>
            </h2>
            <div className="bskin-gallery__frames">
              {view !== 'phone' ? (
                <div className="bskin-gallery__frame bskin-gallery__frame--tv">
                  <iframe title={`${slug} TV`} src={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}`} loading="lazy" />
                </div>
              ) : null}
              {view !== 'tv' ? (
                <div className="bskin-gallery__frame bskin-gallery__frame--phone">
                  <iframe title={`${slug} phone`} src={`${BRACKET_SKINS_PREVIEW_PATH}/${slug}`} loading="lazy" />
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
