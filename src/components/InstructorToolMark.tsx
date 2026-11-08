export type InstructorToolMarkName = 'plan' | 'video' | 'tree' | 'roster' | 'record' | 'board' | 'timer';

/** Approved Instructor tool drawings. No belt rail. */
export function InstructorToolMark({ mark }: { mark: InstructorToolMarkName }) {
  const common = { className: 'instructor-tool__mark', viewBox: '0 0 92 72', 'aria-hidden': true as const };
  if (mark === 'plan') {
    return (
      <svg {...common}>
        <rect x="22" y="10" width="48" height="52" rx="6" fill="#f4f1ea" />
        <path d="M30 24h32M30 34h32M30 44h20" stroke="#14161c" strokeWidth="3" />
      </svg>
    );
  }
  if (mark === 'video') {
    return (
      <svg {...common}>
        <rect x="14" y="16" width="46" height="40" rx="6" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
        <path d="M60 28l16-8v32l-16-8z" fill="#6ea8ff" />
      </svg>
    );
  }
  if (mark === 'tree') {
    return (
      <svg {...common}>
        <path d="M46 58V28M46 40H28v-12M46 48h18V30" fill="none" stroke="#6ea8ff" strokeWidth="3" />
        <circle cx="46" cy="18" r="6" fill="#f4f1ea" />
        <circle cx="28" cy="22" r="5" fill="#2a5cf0" />
        <circle cx="64" cy="24" r="5" fill="#6b3a1f" />
      </svg>
    );
  }
  if (mark === 'roster') {
    return (
      <svg {...common}>
        <circle cx="36" cy="26" r="8" fill="#f4f1ea" />
        <path d="M20 54c2-10 10-14 16-14s14 4 16 14" fill="#f4f1ea" />
        <circle cx="58" cy="28" r="6" fill="#6ea8ff" />
        <path d="M48 54c1-8 6-11 10-11s9 3 10 11" fill="#6ea8ff" />
      </svg>
    );
  }
  if (mark === 'record') {
    return (
      <svg {...common}>
        <rect x="16" y="16" width="60" height="40" rx="6" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
        <path d="M40 28v16l14-8z" fill="#f4f1ea" />
        <circle cx="62" cy="28" r="6" fill="none" stroke="#ef4444" strokeWidth="2" />
        <path d="M66 24l8-6" stroke="#ef4444" strokeWidth="2" />
      </svg>
    );
  }
  if (mark === 'board') {
    return (
      <svg {...common}>
        <rect x="8" y="8" width="76" height="56" rx="4" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
        <rect x="12" y="12" width="68" height="16" fill="#2a5cf0" />
        <rect x="12" y="44" width="68" height="16" fill="#f4f1ea" />
        <text x="18" y="23" fontSize="7" fontWeight="700" fill="#f4f1ea">Blue</text>
        <rect x="40" y="15" width="10" height="10" fill="#4aaf45" />
        <rect x="52" y="15" width="10" height="10" fill="#fc9c36" />
        <rect x="64" y="15" width="10" height="10" fill="#c8102e" />
        <text x="46" y="39" textAnchor="middle" fontSize="8" fontWeight="700" fill="#6ea8ff">5:00</text>
        <text x="18" y="55" fontSize="7" fontWeight="700" fill="#14161c">White</text>
        <rect x="40" y="47" width="10" height="10" fill="#4aaf45" />
        <rect x="52" y="47" width="10" height="10" fill="#fc9c36" />
        <rect x="64" y="47" width="10" height="10" fill="#c8102e" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="8" y="8" width="76" height="56" rx="4" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
      <rect x="14" y="18" width="64" height="36" rx="3" fill="#f4f1ea" />
      <text x="46" y="43" textAnchor="middle" fontSize="22" fontWeight="800" fill="#14161c" fontFamily="ui-monospace, monospace">5:00</text>
    </svg>
  );
}
