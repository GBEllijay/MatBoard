/** Small expand affordance on a Media Console section bar. */
export function FolderChevron() {
  return (
    <span className="saver-folder__chevron" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path
          d="M6 3.5 11 8 6 12.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
