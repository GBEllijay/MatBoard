/**
 * Draft preview. Six sample lines on each D8 face, and sample branches between faces.
 * Ratings stay in memory. This page does not write a check-in.
 */
import { useMemo, useRef, useState } from 'react';
import { PREVIEW_BANNER } from '../crystallineSweeps/adapter.ts';
import { TopoStage } from '../crystallineSweeps/TopoStage.tsx';
import '../crystallineSweeps/crystallineSweeps.css';
import {
  BRANCH_LINKS,
  D8_SUBFACTORS_PATH,
  FACES,
  PROPOSED_NOTE,
  SAMPLE_CHAINS,
  SAMPLE_CHIP,
  SCISSOR_CHAIN_ID,
  SUBFACTOR_DISCLAIMER,
  chainById,
  chainFaceIds,
  faceById,
  linksFrom,
  sampleRatings,
  scoreFace,
  subfactorById,
  type SampleChain,
} from './model.ts';
import { applySubfactorScore, buildSubfactorTopo } from './topoModel.ts';
import type { AssessmentScore } from '../../lib/studentAssessment.ts';
import './d8Subfactors.css';

export { D8_SUBFACTORS_PATH };

const SCORES = [1, 2, 3, 4, 5] as const;

export function D8SubfactorsPreview() {
  const modelRef = useRef<ReturnType<typeof buildSubfactorTopo> | null>(null);
  if (!modelRef.current) {
    const initial = sampleRatings();
    modelRef.current = buildSubfactorTopo(FACES, (id) => initial[id] ?? null);
  }
  const model = modelRef.current;
  const [ratings, setRatings] = useState(sampleRatings);
  const [focus, setFocus] = useState(-1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const chain = chainId ? chainById(chainId) : null;
  const marked = useMemo(() => {
    if (!chain) return [];
    return chainFaceIds(chain)
      .map((id) => model.faces.findIndex((face) => face.id === id))
      .filter((index) => index >= 0);
  }, [chain, model]);
  const face = focus >= 0 ? FACES[focus] : null;

  const openSubfactor = (id: string) => {
    const line = subfactorById(id);
    if (!line) return;
    pending.current = id;
    const button = document.querySelector<HTMLButtonElement>(`[data-face-button="${line.faceId}"]`);
    if (button) {
      button.click();
      return;
    }
    pending.current = null;
    setFocus(model.faces.findIndex((item) => item.id === line.faceId));
    setActiveId(id);
  };

  const showChain = (id: string) => {
    const next = chainById(id);
    if (!next) return;
    setChainId(id);
    openSubfactor(next.steps[0]);
  };

  const rate = (id: string, score: AssessmentScore) => {
    applySubfactorScore(model, id, score);
    setRatings((current) => ({ ...current, [id]: score }));
  };

  return (
    <main className="crystal d8sf">
      <header className="d8sf-top">
        <p className="d8sf-sample">{SAMPLE_CHIP}</p>
        <p className="crystal-banner" role="note" data-testid="preview-banner">
          {PREVIEW_BANNER} {SUBFACTOR_DISCLAIMER}
        </p>
        <h1>Assessment D8</h1>
        <p className="d8sf-proposed">{PROPOSED_NOTE}</p>
        <button
          type="button"
          data-chain-open={SCISSOR_CHAIN_ID}
          aria-pressed={chainId === SCISSOR_CHAIN_ID}
          onClick={() => showChain(SCISSOR_CHAIN_ID)}
        >
          {chainById(SCISSOR_CHAIN_ID)?.title}
        </button>
      </header>
      {chain ? <ChainTrail chain={chain} activeId={activeId} onOpen={openSubfactor} onClear={() => setChainId(null)} /> : null}
      <TopoStage
        model={model}
        style="pyramid"
        focus={focus}
        selected={-1}
        comparison={false}
        pair={false}
        links={[]}
        drillPath={[]}
        relief={1}
        hue={1}
        marked={marked}
        onFocus={(index) => {
          if (index < 0) {
            pending.current = null;
            setFocus(-1);
            setActiveId(null);
            setChainId(null);
            return;
          }
          setFocus(index);
          const id = pending.current;
          pending.current = null;
          const line = id ? subfactorById(id) : null;
          setActiveId(line && model.faces[index]?.id === line.faceId ? line.id : null);
        }}
        onSelect={(index) => {
          const tile = model.tiles[index];
          if (!tile?.move) return;
          setFocus(tile.faceIndex);
          setActiveId(tile.move.id);
        }}
        onDrill={() => {}}
      />
      <div className="crystal-readout">
        {face ? (
          <FacePanel
            face={face}
            ratings={ratings}
            activeId={activeId}
            onOpen={openSubfactor}
            onRate={rate}
            onFollow={(id) => {
              const link = linksFrom(activeId ?? '').find((item) => item.toId === id);
              if (link) setChainId(link.chainId);
              openSubfactor(id);
            }}
          />
        ) : (
          <section aria-label="Eight faces">
            <h2>Eight faces</h2>
            <p>Tap a face, or use the factor buttons. Each score is the rounded average of its six lines. Sample ratings can change here. They are not saved.</p>
            <ul className="d8sf-face-scores">
              {FACES.map((item) => {
                const score = scoreFace(item, ratings);
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => document.querySelector<HTMLButtonElement>(`[data-face-button="${item.id}"]`)?.click()}>
                      <span>{item.label}</span>
                      <span>{score == null ? 'Not rated' : `${score} / 5`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <details className="d8sf-more">
          <summary>Other sample branches</summary>
          <ul className="d8sf-chain-list">
            {SAMPLE_CHAINS.filter((item) => item.id !== SCISSOR_CHAIN_ID).map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={chainId === item.id} onClick={() => showChain(item.id)}>
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
        <p className="crystal-source">{BRANCH_LINKS.length} sample hops. Each hop leaves its face. Nothing is written to this device.</p>
      </div>
    </main>
  );
}

function ChainTrail({
  chain,
  activeId,
  onOpen,
  onClear,
}: {
  chain: SampleChain;
  activeId: string | null;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <nav className="d8sf-trail" aria-label="Branch trail" data-chain={chain.id}>
      <p className="d8sf-kicker">{chain.id === SCISSOR_CHAIN_ID ? 'Sweep side to submission side' : 'Sample branch'}</p>
      <ol>
        {chain.steps.map((id, index) => {
          const line = subfactorById(id);
          const face = line ? faceById(line.faceId) : null;
          return (
            <li key={id}>
              {index > 0 ? <span className="d8sf-arrow" aria-hidden="true">→</span> : null}
              <button type="button" aria-current={activeId === id ? 'step' : undefined} onClick={() => onOpen(id)}>
                <span className="d8sf-kicker">{face?.label}</span>
                <span>{line?.label}</span>
              </button>
            </li>
          );
        })}
        {chain.fan.length ? (
          <li className="d8sf-fan">
            <span className="d8sf-arrow" aria-hidden="true">→</span>
            <div>
              <p className="d8sf-kicker">Submissions</p>
              <ul>
                {chain.fan.map((id) => {
                  const line = subfactorById(id);
                  return (
                    <li key={id}>
                      <button type="button" aria-current={activeId === id ? 'step' : undefined} onClick={() => onOpen(id)}>
                        {line?.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        ) : null}
      </ol>
      <button type="button" onClick={onClear}>
        Clear branch
      </button>
    </nav>
  );
}

function FacePanel({
  face,
  ratings,
  activeId,
  onOpen,
  onRate,
  onFollow,
}: {
  face: (typeof FACES)[number];
  ratings: Record<string, AssessmentScore>;
  activeId: string | null;
  onOpen: (id: string) => void;
  onRate: (id: string, score: AssessmentScore) => void;
  onFollow: (id: string) => void;
}) {
  const score = scoreFace(face, ratings);
  const active = activeId ? subfactorById(activeId) : null;
  const outgoing = active && active.faceId === face.id ? linksFrom(active.id) : [];
  return (
    <section aria-label={`${face.label} sub-factors`}>
      <h2>{face.label}</h2>
      <p data-testid="face-score" aria-live="polite">
        Face score {score == null ? 'not rated' : `${score} / 5`}
      </p>
      <p>Rounded average of these six lines.</p>
      {face.proposed ? <p className="d8sf-proposed">{PROPOSED_NOTE}</p> : <p>Check-in labels. This preview does not save them.</p>}
      <ul className="d8sf-lines">
        {face.subfactors.map((line) => (
          <li key={line.id} data-subfactor={line.id}>
            <button type="button" className="d8sf-line" aria-pressed={activeId === line.id} onClick={() => onOpen(line.id)}>
              <span>{line.label}</span>
              <span>{ratings[line.id]} / 5</span>
            </button>
            <div className="d8sf-rates" role="group" aria-label={`Rate ${line.label}`}>
              {SCORES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="d8sf-rate"
                  aria-pressed={ratings[line.id] === value}
                  aria-label={`${line.label} ${value}`}
                  onClick={() => onRate(line.id, value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {active && active.faceId === face.id ? (
        <section aria-label={`${active.label} branches`}>
          <h3>Branches</h3>
          {active.definition ? <p>{active.definition}</p> : null}
          {active.glossary && active.glossary !== active.label ? <p>Glossary term: {active.glossary}.</p> : null}
          {outgoing.length ? (
            <ul className="d8sf-chain-list">
              {outgoing.map((link) => {
                const next = subfactorById(link.toId);
                const nextFace = next ? faceById(next.faceId) : null;
                return (
                  <li key={link.id}>
                    <button type="button" onClick={() => onFollow(link.toId)}>
                      {next?.label}
                      <span className="d8sf-kicker">{nextFace?.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No sample branch from this line.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
