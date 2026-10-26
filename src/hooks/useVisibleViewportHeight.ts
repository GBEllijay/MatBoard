import { useEffect } from 'react';

/**
 * Size fullscreen views to the visible viewport (in-app browsers, toolbars).
 * Keyboard pan fires visualViewport scroll without a height change. Rewriting
 * `--visible-vh` on that scroll resizes fixed shells and snaps the page back.
 */
export function useVisibleViewportHeight(): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const viewport = window.visualViewport;
      const height = Math.round(viewport?.height ?? window.innerHeight);
      const next = `${height}px`;
      if (root.style.getPropertyValue('--visible-vh') === next) return;
      root.style.setProperty('--visible-vh', next);
    };
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.addEventListener('resize', apply);
    return () => {
      window.visualViewport?.removeEventListener('resize', apply);
      window.removeEventListener('resize', apply);
      root.style.removeProperty('--visible-vh');
    };
  }, []);
}
