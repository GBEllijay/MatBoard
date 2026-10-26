import type { CSSProperties } from 'react';
import type { WornBeltPreview } from '../../lib/studentRank';

/** Cloth variables for a kids belt. My rank and the hub mark share this. */
export function kidsClothStyle(belt: {
  base: string;
  ink: 'navy' | 'white';
  centerColor: string;
}): CSSProperties {
  return {
    ['--cloth' as string]: belt.base,
    ['--edge' as string]: 'rgba(0,0,0,0.28)',
    ['--stitch' as string]: belt.ink === 'navy' ? '#bdb6a4' : 'rgba(255,255,255,0.35)',
    ['--center' as string]: belt.centerColor,
  };
}

/**
 * The belt the student wears, drawn with the My rank cloth and stripe rules.
 * It is not a control. The page that shows it decides where a tap goes.
 */
export function WornBeltMark({ preview }: { preview: WornBeltPreview }) {
  const filled = preview.slots.filter((slot) => slot.on).length;
  if (preview.kind === 'final') {
    return (
      <span className="s-belt-mark" data-stripes="0" data-belt={preview.belt} data-system="adult" aria-hidden="true">
        <span className={`mini-belt mini-belt--${preview.appearance}`} />
      </span>
    );
  }

  const kids = preview.kind === 'kids';
  const black = preview.belt === 'black';
  return (
    <span
      className="s-belt-mark"
      data-stripes={String(filled)}
      data-slots={String(preview.slots.length)}
      data-belt={preview.belt}
      data-system={preview.system}
      aria-hidden="true"
    >
      <span
        className={`rung${kids ? ' rung--kids' : ` rung--${preview.belt}`}${kids && preview.ink === 'navy' ? ' rung--kids-ink-navy' : ''}`}
        style={kids ? kidsClothStyle(preview) : undefined}
      >
        <span
          className={black ? 'belt belt--slim57' : kids ? 'belt belt--kids' : 'belt'}
          data-instructor-bars={preview.instructorBars ? 'on' : 'off'}
          data-center={kids ? preview.center : undefined}
          style={
            kids
              ? { ['--barw' as string]: `calc(var(--slot) * ${Math.max(preview.slots.length, 1)} + 12px)` }
              : undefined
          }
        >
          <span className="belt__body">
            <span className="belt__name">{preview.label}</span>
          </span>
          <span className="belt__bar">
            {preview.slots.map((slot, index) => (
              <span
                key={index}
                className={slot.on ? 'stripe is-on' : 'stripe'}
                style={slot.on && slot.color ? { ['--tape' as string]: slot.color } : undefined}
              >
                <span className="tape" />
              </span>
            ))}
            {preview.instructorBars ? (
              <>
                <span className="ibar ibar--l" aria-hidden="true" />
                <span className="ibar ibar--r" aria-hidden="true" />
              </>
            ) : null}
          </span>
          {black ? <span className="belt__end" aria-hidden="true" /> : null}
        </span>
      </span>
    </span>
  );
}
