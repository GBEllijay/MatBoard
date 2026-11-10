/**
 * One sample index card. Ratings and added branches stay in memory.
 * This page does not write a journal, a rating, a video, a tree, or a D8 score.
 */
import { useState } from 'react';
import { ratingNote, shownRating } from '../termCard/model.ts';
import {
  INDEX_CARD_PATH,
  INITIAL_PROFICIENCY,
  JOURNAL_ENTRIES,
  OTHER_ITEM,
  SAMPLE_CHIP,
  SAMPLE_DISCLAIMER,
  SAMPLE_TECHNIQUE,
  SAMPLE_TREE,
  SAMPLE_VIDEO,
  SCISSOR,
  addNamedBranch,
  chooseProficiency,
  nextBranchName,
  type TreeNode,
} from './model.ts';
import './indexCard.css';

export { INDEX_CARD_PATH };

export function IndexCardPreviewPage() {
  const [rating, setRating] = useState<number | null>(null);
  const [tree, setTree] = useState<TreeNode>(SAMPLE_TREE);
  const shown = shownRating(rating ?? INITIAL_PROFICIENCY);

  return (
    <main className="ic-page">
      <div className="ic-wrap">
        <article className="ic-card" aria-label={`${SCISSOR.name} index card`} data-testid="index-card">
          <p className="ic-sample" role="note">
            <span className="ic-sample-label">{SAMPLE_CHIP}</span>
            <span className="ic-sample-rest">{SAMPLE_DISCLAIMER}</span>
          </p>
          <header className="ic-head">
            <h1 className="ic-title">{SCISSOR.name}</h1>
            <p className="ic-face">
              <span className="ic-kicker">D8 face</span>
              <span className="ic-face-name">{SCISSOR.face}</span>
            </p>
            <p className="ic-face">
              <span className="ic-kicker">Sub-factor group</span>
              <span className="ic-face-name">{SCISSOR.group}</span>
            </p>
          </header>

          <section className="ic-block" aria-labelledby="ic-tagged">
            <h2 id="ic-tagged">Tagged with this term</h2>
            <h3>Journal</h3>
            <ul className="ic-entries">
              {JOURNAL_ENTRIES.map((entry) => (
                <li key={entry.id}>
                  <p className="ic-entry">
                    <time>{entry.date}</time>
                    <span>{entry.note}</span>
                  </p>
                </li>
              ))}
            </ul>
            <h3>Video</h3>
            <a className="ic-video" href={SAMPLE_VIDEO.href}>
              <span className="ic-video-title">{SAMPLE_VIDEO.title}</span>
              <span className="ic-video-link">{SAMPLE_VIDEO.label}</span>
            </a>
            <h3>Technique</h3>
            <p className="ic-move">
              <span className="ic-move-name">{SAMPLE_TECHNIQUE.name}</span>
              <span>{SAMPLE_TECHNIQUE.note}</span>
            </p>
          </section>

          <section className="ic-block" aria-labelledby="ic-tree">
            <h2 id="ic-tree">Technique tree</h2>
            <p className="ic-legend">Follow-ups are solid. Defenses and counters are dashed.</p>
            <div data-testid="technique-tree">
              <TreeView node={tree} />
            </div>
            <button
              type="button"
              className="ic-add"
              data-testid="add-branch"
              onClick={() => setTree((current) => addNamedBranch(current, nextBranchName(current)))}
            >
              Add branch
            </button>
          </section>

          <section className="ic-block" aria-labelledby="ic-other">
            <h2 id="ic-other">
              Other
              <span className="ic-count">1</span>
            </h2>
            <article className="ic-other" data-testid="other-item">
              <p className="ic-review">{OTHER_ITEM.label}</p>
              <p className="ic-other-note">{OTHER_ITEM.note}</p>
            </article>
          </section>

          <section className="ic-block" aria-labelledby="ic-rate">
            <h2 id="ic-rate">Proficiency</h2>
            <div className="ic-rates" role="group" aria-label={`Rate ${SCISSOR.name}`}>
              {([1, 2, 3, 4, 5] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="ic-rate"
                  aria-pressed={shown === value}
                  aria-label={`${SCISSOR.name} ${value}`}
                  onClick={() => setRating(chooseProficiency(value))}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="ic-hint">{ratingNote(rating)}</p>
          </section>
        </article>
      </div>
    </main>
  );
}

function TreeView({ node }: { node: TreeNode }) {
  return (
    <div className="ic-branch">
      <article className="ic-node" data-kind={node.kind} data-node={node.id}>
        <div className="ic-node-head">
          <span className="ic-node-name">{node.name}</span>
          {node.kind === 'follow' ? <span className="ic-chip">Follow-up</span> : null}
          {node.kind === 'defense' ? <span className="ic-chip ic-chip--defense">Defense</span> : null}
        </div>
      </article>
      {node.children.length > 0 ? (
        <ul className="ic-kids">
          {node.children.map((child) => (
            <li key={child.id}>
              <TreeView node={child} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
