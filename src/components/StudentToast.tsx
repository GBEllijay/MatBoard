import { useEffect, useState } from 'react';
import { STUDENT_TOAST_EVENT, takeRecentToast } from '../lib/studentAlerts';

const TOAST_MS = 3200;

/**
 * Small "Updated" pill at the bottom of Student Edition. Anything can raise it
 * with showStudentToast(text). One line, polite live region, fades on its own.
 */
export function StudentToast() {
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const text = (event as CustomEvent<{ text?: unknown }>).detail?.text;
      if (typeof text !== 'string' || !text.trim()) return;
      setToast({ text: text.trim(), key: Date.now() });
    };
    window.addEventListener(STUDENT_TOAST_EVENT, show);
    // Arrivals found on first open fire before this listener exists.
    const missed = takeRecentToast();
    if (missed) setToast({ text: missed, key: Date.now() });
    return () => window.removeEventListener(STUDENT_TOAST_EVENT, show);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(handle);
  }, [toast]);

  // aria-live without role="status": this region is always mounted (so the
  // first toast is announced), and an always-present empty status role
  // shadows each screen's own status line (e.g. Journal "Saved").
  return (
    <div className="student-toast-region" aria-live="polite" aria-atomic="true">
      {toast ? (
        <p key={toast.key} className="student-toast">
          <span className="student-toast__dot" aria-hidden="true" />
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
