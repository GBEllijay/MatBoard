/**
 * Navigation rules pasted into the generated service worker.
 * The functions are self-contained: the worker build copies their source and
 * does not bundle this module. /api and /paid never receive the app shell.
 * /card and /half-off are separate pages, not the installed app.
 */

export const APP_NAV_SHELL_BODY = String.raw`
const path = pathname;
if (path === "/api" || path.startsWith("/api/")) return false;
if (path === "/paid" || path.startsWith("/paid/")) return false;
if (/^\/(?:card|half-off)(?:\/|\.html)?$/.test(path)) return false;
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
 */
export const APP_SHELL_HANDLER_SOURCE = `async function appShellHandler({ request }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response && response.ok) return response;
  } catch {
    /* offline, slow, or the server is gone */
  } finally {
    clearTimeout(timer);
  }
  const shell = await caches.match("/index.html", { ignoreSearch: true });
  if (shell) return shell;
  return new Response("Offline", { status: 503, headers: { "content-type": "text/plain;charset=UTF-8" } });
}`;

export function createAppShellHandler(): (ctx: { request: Request }) => Promise<Response> {
  return new Function(`return (${APP_SHELL_HANDLER_SOURCE});`)() as (ctx: { request: Request }) => Promise<Response>;
}
