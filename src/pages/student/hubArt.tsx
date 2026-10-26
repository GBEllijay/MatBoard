/** Decorations for the Student Edition hub. They are not controls. */

const ICONS: Record<string, string> = {
  page: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  levels: '<path d="M5 20V14M12 20V9M19 20V4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  belt: '<rect x="2" y="9" width="20" height="6" rx="1.5"/><path d="M15 9v6M18 9v6"/>',
  check: '<path d="M4 12.5 9 17 20 6"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 9a5 5 0 0 1 8 0"/><path d="m12 9 1.5-2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14a5 5 0 0 1 5.5 5"/>',
  trophy: '<circle cx="12" cy="14" r="5"/><path d="M8 3l4 6 4-6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-4"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M12 11v6M9.5 14.5 12 17l2.5-2.5"/>',
  import: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  save: '<path d="M12 4v10M8 10l4 4 4-4"/><path d="M4 17h16v3H4z"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

const ICON_FOR_LABEL: Record<string, keyof typeof ICONS> = {
  "Today's page": 'page',
  'Journal cards': 'cards',
  Calendar: 'cal',
  'Video Library': 'video',
  Fundamentals: 'levels',
  'Belt progress': 'target',
  'My rank': 'belt',
  'Self-assessment': 'check',
  'Upcoming tournaments': 'cal',
  'Weight management': 'scale',
  'Opponent scouting': 'people',
  Results: 'trophy',
  'Connect to my academy': 'qr',
  'Make a file for my coach': 'file',
  'Import from coach': 'import',
  'Print progress report': 'print',
  'Print self-assessment': 'print',
  Connections: 'link',
  'Backup & Print': 'save',
};

export function RowIcon({ label }: { label: string }) {
  const name = ICON_FOR_LABEL[label];
  if (!name) return null;
  return (
    <svg className="s-ico" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

export function Chevron() {
  return <span className="s-chev" aria-hidden="true" />;
}

/**
 * White belt cloth with a black rank bar and four stripe rectangles.
 * The rectangles stay empty. Filling an earned stripe comes later.
 */
export function WhiteBelt({
  filled,
  emphasizeNext = false,
  slots = 4,
}: {
  filled: number;
  emphasizeNext?: boolean;
  slots?: number;
}) {
  const count = Math.max(0, Math.min(slots, filled));
  return (
    <span className="s-belt" data-stripes={count} aria-hidden="true">
      <span className="s-belt__bar">
        {Array.from({ length: slots }, (_, index) => {
          const state = index < count ? 'on' : emphasizeNext && index === count ? 'next' : 'off';
          return <i key={index} className={`s-tape s-tape--${state}`} />;
        })}
      </span>
      <span className="s-belt__end" />
    </span>
  );
}

export function JournalDecor() {
  return (
    <>
      <span className="s-journal__elastic" aria-hidden="true" />
      <span className="s-journal__stamp" aria-hidden="true" />
      <span className="s-journal__ribbon" aria-hidden="true" />
    </>
  );
}

export function BinderDecor() {
  return (
    <>
      <span className="s-binder__spine" aria-hidden="true" />
      <span className="s-binder__hole s-binder__hole--top" aria-hidden="true" />
      <span className="s-binder__ring s-binder__ring--top" aria-hidden="true" />
      <span className="s-binder__hole s-binder__hole--bottom" aria-hidden="true" />
      <span className="s-binder__ring s-binder__ring--bottom" aria-hidden="true" />
      <span className="s-binder__stamp" aria-hidden="true" />
    </>
  );
}

export function BracketArt() {
  return (
    <svg className="s-bracket" viewBox="0 0 120 84" fill="none" strokeLinecap="round" aria-hidden="true">
      <g stroke="rgba(255,255,255,.35)" strokeWidth="2">
        <path d="M4 10h26v20H4M30 20h20" />
        <path d="M4 54h26v20H4M30 64h20" />
        <path d="M50 20v44M50 42h22" />
      </g>
      <path d="M4 10h26v10h20v22h22" stroke="#2f7bff" strokeWidth="3" />
      <circle cx="4" cy="10" r="3.5" fill="#004eba" stroke="#8fb6ff" strokeWidth="1.5" />
      <g transform="translate(92 42)">
        <path d="M-8 -18 0 -6 8 -18" stroke="#2f7bff" strokeWidth="4" strokeLinejoin="round" />
        <circle r="12" fill="#cfd6df" stroke="#8b96a6" strokeWidth="2" />
        <circle r="7.5" fill="none" stroke="#a9b3c0" strokeWidth="1.5" />
        <path d="m0-4 1.2 2.4 2.6.4-1.9 1.8.5 2.6L0 2l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z" fill="#8b96a6" />
      </g>
    </svg>
  );
}
