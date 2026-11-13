/**
 * Navigation rules pasted into the generated service worker.
 * The functions are self-contained: the worker build copies their source and
 * does not bundle this module. /api and /paid never receive the app shell.
 * /half-off is a separate page, not the installed app.
 */

export const APP_NAV_SHELL_BODY = String.raw`
const path = pathname;
if (path === "/api" || path.startsWith("/api/")) return false;
if (path === "/paid" || path.startsWith("/paid/")) return false;
if (/^\/half-off(?:\/|\.html)?$/.test(path)) return false;
return true;
`;

/** True when a navigation should fall back to the precached index.html. */
export function appNavigationUsesShell(pathname: string): boolean {
  const check = new Function('pathname', APP_NAV_SHELL_BODY) as (pathname: string) => boolean;
  return check(pathname);
}

/** Matches app navigations. Self-contained so the worker can paste the source. */
export function createAppShellNavigation(): (ctx: { request: { mode?: string }; url: { pathname: string } }) => boolean {
  return new Function(
    '{ request, url }',
    `if (request.mode !== "navigate") return false;\nconst pathname = url.pathname;\n${APP_NAV_SHELL_BODY}`,
  ) as (ctx: { request: { mode?: string }; url: { pathname: string } }) => boolean;
}

/**
 * Network first. A failed, slow (4s), or non-OK response uses the precached
 * index.html from this deploy. Nothing is written to a page cache, so an old
 * HTML file cannot point at chunks a newer deploy removed.
 *
 * The navigation request is fetched as-is, with no RequestInit. Chrome throws
 * "Cannot construct a Request with a Request whose mode is 'navigate' and a
 * non-empty RequestInit" when an init (such as an AbortSignal) is passed, which
 * sent every deep link to the fallback. The 4s limit is a race instead.
 * A cached shell that was saved through a redirect (Pages sends /index.html to
 * / with a 308) is copied into a plain response, because Chrome refuses a
 * redirected response for a navigation with ERR_FAILED.
 */
export const APP_SHELL_HANDLER_SOURCE = `async function appShellHandler({ request }) {
  let timer;
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 4000);
      }),
    ]);
    if (response && response.ok && !response.redirected) return response;
  } catch {
    /* offline, slow, or the server is gone */
  } finally {
    clearTimeout(timer);
  }
  const shell = await caches.match("/index.html", { ignoreSearch: true });
  if (shell) {
    if (!shell.redirected) return shell;
    const body = await shell.blob();
    return new Response(body, { status: shell.status, statusText: shell.statusText, headers: shell.headers });
  }
  return new Response("Offline", { status: 503, headers: { "content-type": "text/plain;charset=UTF-8" } });
}`;

export function createAppShellHandler(): (ctx: { request: Request }) => Promise<Response> {
  return new Function(`return (${APP_SHELL_HANDLER_SOURCE});`)() as (ctx: { request: Request }) => Promise<Response>;
}
