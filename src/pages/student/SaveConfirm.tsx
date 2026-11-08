import { useEffect, useRef } from 'react';

/**
 * One check after a save that already landed on this phone.
 * The ring plays once. Reduced motion keeps the check still.
 * This is not a cloud upload.
 */
export function SaveConfirm({ message, token }: { message: string; token: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [token]);
  return (
    <p ref={ref} className="save-confirm" role="status" data-save-confirm={token}>
      <span key={token} className="save-confirm__mark" aria-hidden="true">
        ✓
      </span>
      <span>{message}</span>
    </p>
  );
}
