import type { InstructorCard } from './model';

export function CardMark({ mark }: { mark: InstructorCard['mark'] }) {
  const common = { className: 'php-mark', viewBox: '0 0 92 72', 'aria-hidden': true as const };
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
        <rect x="18" y="20" width="40" height="28" rx="6" fill="#102033" stroke="#f4f1ea" strokeWidth="2" />
        <circle cx="38" cy="34" r="7" fill="#ef4444" />
        <rect x="58" y="28" width="14" height="10" rx="2" fill="#6ea8ff" />
      </svg>
    );
  }
  if (mark === 'board') {
    return (
      <svg {...common}>
        <rect x="12" y="14" width="68" height="44" rx="6" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
        <rect x="18" y="20" width="26" height="32" fill="#223bca" />
        <rect x="48" y="20" width="26" height="32" fill="#f8f9fc" />
        <text x="31" y="40" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">0</text>
        <text x="61" y="40" textAnchor="middle" fontSize="12" fontWeight="700" fill="#102048">0</text>
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="46" cy="36" r="20" fill="none" stroke="#6ea8ff" strokeWidth="3" />
      <path d="M46 24v13l8 5" fill="none" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
