/**
 * Cloudflare Turnstile for the restore page. The script loads only on that page, in explicit
 * render mode, and the site key comes from /api/config. Tokens are single use, so the page
 * resets the widget after every attempt.
 */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export type TurnstileRenderOptions = {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  appearance?: 'always' | 'execute' | 'interaction-only';
  action?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  'timeout-callback'?: () => void;
};

export type TurnstileApi = {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let loading: Promise<TurnstileApi | null> | null = null;

export function resetTurnstileLoaderForTests(): void {
  loading = null;
}

/** Inject the script once. Resolves null if it cannot load (blocked, offline, or timed out). */
export function loadTurnstile(timeoutMs = 15_000): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
  const win = window as TurnstileWindow;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi | null>((resolve) => {
    let settled = false;
    const finish = (api: TurnstileApi | null) => {
      if (settled) return;
      settled = true;
      if (!api) loading = null;
      resolve(api);
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => finish(win.turnstile ?? null));
    script.addEventListener('error', () => finish(null));
    if (!existing) {
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    setTimeout(() => finish(win.turnstile ?? null), timeoutMs);
  });
  return loading;
}

/** The public site key, or null when /api/config does not have one. */
export async function fetchTurnstileSiteKey(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl('/api/config', { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as { turnstileSiteKey?: unknown };
    return typeof body.turnstileSiteKey === 'string' && body.turnstileSiteKey.trim() ? body.turnstileSiteKey.trim() : null;
  } catch {
    return null;
  }
}
