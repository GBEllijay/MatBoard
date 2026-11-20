/**
 * Belt Chain lineage panel for the academy Identity card.
 * Root masters use a red belt bar, the same treatment as every other ancestor.
 */
import { useState } from 'react';
import {
  academyMonogram,
  collapsedAncestorIndices,
  displayLineageSteps,
  parseLineage,
  type LineageBelt,
  type LineageStep,
  type LineageStyle,
} from '../lib/academyIdentity.ts';

export function AcademyBeltBar({ belt, size = 'rail' }: { belt: LineageBelt; size?: 'rail' | 'ribbon' }) {
  return <span className={`acad-belt acad-belt--${belt} acad-belt--${size}`} data-belt={belt} aria-hidden="true" />;
}

export function AcademyMark({
  logoSrc,
  monogram,
  size = 'sm',
}: {
  logoSrc?: string | null;
  monogram: string;
  size?: 'sm' | 'md';
}) {
  if (logoSrc) {
    return <img className={`acad-mark acad-mark--${size}`} src={logoSrc} alt="" />;
  }
  return (
    <span className={`acad-mark acad-mark--${size} acad-mark--mono`} aria-hidden="true">
      {monogram}
    </span>
  );
}

export function AcademyBeltChain({
  lineage,
  gymName,
  logoSrc,
  example = false,
  style = 'rail',
}: {
  lineage: string;
  gymName: string;
  logoSrc?: string | null;
  example?: boolean;
  style?: LineageStyle;
}) {
  const steps = displayLineageSteps(parseLineage(lineage));
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;
  const collapse = collapsedAncestorIndices(steps.length, expanded);
  const monogram = academyMonogram(gymName);
  const shown = collapse.visible.map((index) => steps[index]!).filter(Boolean);
  const showMoreAfter = collapse.hidden > 0 ? 1 : -1;

  return (
    <section className={`acad-lineage acad-lineage--${style}`} data-testid="academy-lineage" data-lineage-style={style} aria-label="Lineage">
      <div className="acad-lineage__head">
        <p className="acad-lineage__kicker">Lineage</p>
        {example ? <span className="acad-lineage__example">Example data</span> : null}
      </div>
      {style === 'cards' ? (
        <BeltCards
          steps={shown}
          gymName={gymName}
          monogram={monogram}
          logoSrc={logoSrc}
          hidden={collapse.hidden}
          moreAfter={showMoreAfter}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      ) : null}
      {style === 'ribbon' ? (
        <HeritageRibbon
          steps={shown}
          gymName={gymName}
          monogram={monogram}
          logoSrc={logoSrc}
          hidden={collapse.hidden}
          moreAfter={showMoreAfter}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      ) : null}
      {style === 'rail' ? (
        <ClassicRail
          steps={shown}
          gymName={gymName}
          monogram={monogram}
          logoSrc={logoSrc}
          hidden={collapse.hidden}
          moreAfter={showMoreAfter}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      ) : null}
    </section>
  );
}

type ChainProps = {
  steps: LineageStep[];
  gymName: string;
  monogram: string;
  logoSrc?: string | null;
  hidden: number;
  moreAfter: number;
  expanded: boolean;
  onToggle: () => void;
};

function MoreControl({ hidden, expanded, onToggle, className }: { hidden: number; expanded: boolean; onToggle: () => void; className?: string }) {
  if (hidden <= 0 && !expanded) return null;
  return (
    <button type="button" className={className ?? 'acad-more'} onClick={onToggle} data-testid="lineage-more">
      {expanded ? 'Show less' : `+${hidden} more`}
    </button>
  );
}

function NodeCopy({ step }: { step: LineageStep }) {
  return (
    <div className="acad-node__copy">
      <div className="acad-node__name">{step.name}</div>
      {step.title ? <div className="acad-node__title">{step.title}</div> : null}
    </div>
  );
}

function ClassicRail({ steps, gymName, monogram, logoSrc, hidden, moreAfter, expanded, onToggle }: ChainProps) {
  return (
    <div className="acad-rail">
      {steps.map((step, index) => (
        <div key={`${step.name}-${index}`}>
          {index === moreAfter + 1 && hidden > 0 && !expanded ? (
            <div className="acad-rail__more">
              <div className="acad-rail__track">
                <span className="acad-rail__spine" />
              </div>
              <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} />
            </div>
          ) : null}
          <div className="acad-rail__node">
            <div className="acad-rail__track">
              <span className="acad-rail__spine" />
              <span className="acad-rail__pip" />
            </div>
            <AcademyBeltBar belt={step.belt} />
            <NodeCopy step={step} />
          </div>
        </div>
      ))}
      {expanded ? (
        <div className="acad-rail__less">
          <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} className="acad-more acad-more--less" />
        </div>
      ) : null}
      <div className="acad-rail__node acad-rail__node--gym">
        <div className="acad-rail__track">
          <span className="acad-rail__spine" />
        </div>
        <AcademyMark logoSrc={logoSrc} monogram={monogram} />
        <div className="acad-node__copy">
          <div className="acad-node__name">{gymName}</div>
          <div className="acad-node__title">This academy</div>
        </div>
      </div>
    </div>
  );
}

function BeltCards({ steps, gymName, monogram, logoSrc, hidden, moreAfter, expanded, onToggle }: ChainProps) {
  return (
    <ol className="acad-cards">
      {steps.map((step, index) => (
        <li key={`${step.name}-${index}`}>
          {index === moreAfter + 1 && hidden > 0 && !expanded ? (
            <div className="acad-cards__more">
              <span className="acad-cards__tick" aria-hidden="true" />
              <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} />
            </div>
          ) : null}
          <div className="acad-card" data-belt={step.belt}>
            <span className={`acad-card__stripe acad-card__stripe--${step.belt}`} aria-hidden="true" />
            <NodeCopy step={step} />
          </div>
          <span className="acad-cards__tick" aria-hidden="true" />
        </li>
      ))}
      {expanded ? (
        <li className="acad-cards__less">
          <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} className="acad-more acad-more--less" />
        </li>
      ) : null}
      <li>
        <div className="acad-card acad-card--gym">
          <AcademyMark logoSrc={logoSrc} monogram={monogram} />
          <div className="acad-node__copy">
            <div className="acad-node__name">{gymName}</div>
            <div className="acad-node__title">This academy</div>
          </div>
        </div>
      </li>
    </ol>
  );
}

function HeritageRibbon({ steps, gymName, monogram, logoSrc, hidden, moreAfter, expanded, onToggle }: ChainProps) {
  return (
    <ol className="acad-ribbon">
      {steps.map((step, index) => (
        <li key={`${step.name}-${index}`} className="acad-ribbon__row">
          {index === moreAfter + 1 && hidden > 0 && !expanded ? (
            <div className="acad-ribbon__more">
              <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} />
            </div>
          ) : null}
          {index > 0 ? <div className="acad-ribbon__rule" aria-hidden="true" /> : null}
          <div className="acad-ribbon__body">
            <AcademyBeltBar belt={step.belt} size="ribbon" />
            <NodeCopy step={step} />
          </div>
        </li>
      ))}
      {expanded ? (
        <li className="acad-ribbon__less">
          <MoreControl hidden={hidden} expanded={expanded} onToggle={onToggle} className="acad-more acad-more--less" />
        </li>
      ) : null}
      <li className="acad-ribbon__row acad-ribbon__row--gym">
        <div className="acad-ribbon__rule" aria-hidden="true" />
        <div className="acad-ribbon__body">
          <AcademyMark logoSrc={logoSrc} monogram={monogram} size="md" />
          <div className="acad-node__copy">
            <div className="acad-node__name">{gymName}</div>
            <div className="acad-node__title">This academy</div>
          </div>
        </div>
      </li>
    </ol>
  );
}
