/**
 * Competition and Tournament Management tool mark (Design Critic Coach, v2 medal,
 * 14 Nov 2026): green ribbon, yellow medal, navy 4-team bracket reading left to right.
 * Option B: the 4px green/yellow stripe sits on the icon tile's left edge (CSS, not SVG).
 * Kept apart from InstructorToolMark so the icon or the stripe can be swapped alone.
 * Literal hex colors only, so the cream label color never tints it.
 */
export function CompetitionToolMark() {
  return (
    <span className="instructor-tool__mark instructor-tool__mark--competition">
      <i className="instructor-tool__stripe" aria-hidden="true" />
      <svg viewBox="0 0 92 72" fill="none" aria-hidden="true">
        <path d="M36 6h11l-3 20H32L36 6z" fill="#4AAF45" />
        <path d="M51 6h11l4 20H52L51 6z" fill="#4AAF45" />
        <path d="M48.5 7v18" stroke="#0c2344" strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="50" cy="43" r="23" fill="#ffe24a" />
        <circle cx="50" cy="43" r="21.2" stroke="#0c2344" strokeWidth="1.75" />
        <path
          d="M37.5 31.5h8.5M37.5 39h8.5M46 31.5v7.5M46 35.25h8.5M37.5 47h8.5M37.5 54.5h8.5M46 47v7.5M46 50.75h8.5M54.5 35.25v15.5M54.5 43h8.5"
          stroke="#0c2344"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
