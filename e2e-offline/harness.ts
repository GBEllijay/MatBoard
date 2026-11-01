import http from 'node:http';
import net from 'node:net';
import type { Socket } from 'node:net';
import type { BrowserContext, Page } from '@playwright/test';
import { issueToken } from '../src/server/tokenIssue.ts';

/** vite preview (production build) listens here; the tests talk to the proxy. */
export const UPSTREAM_PORT = 4191;
export const PROXY_PORT = 4192;
export const BASE = `http://127.0.0.1:${PROXY_PORT}`;
export const DAY_MS = 86_400_000;

/**
 * A production-like front door that can be switched off. Playwright's
 * context.setOffline does not cut a service worker's own network, so a real
 * "no internet" test stops this server as well.
 *
 * /paid needs a bearer token like the real worker (the preview server itself
 * serves /paid openly), and paid answers come back private/no-store.
 */
export class GatedProxy {
  private server: http.Server | null = null;
  private sockets = new Set<Socket>();

  async start(): Promise<void> {
    if (this.server) return;
    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      const paid = url.startsWith('/paid/') && !url.startsWith('/paid/manifest');
      if (paid && !(req.headers.authorization ?? '').startsWith('Bearer ')) {
        res.writeHead(401, { 'content-type': 'text/plain' });
        res.end('Access token required.');
        return;
      }
      const upstream = http.request(
        { host: '127.0.0.1', port: UPSTREAM_PORT, path: url, method: req.method, headers: req.headers },
        (answer) => {
          const headers = { ...answer.headers };
          if (paid && answer.statusCode === 200) {
            headers['cache-control'] = 'private, no-store';
            headers.vary = 'Authorization, Cookie';
          }
          res.writeHead(answer.statusCode ?? 502, headers);
          answer.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    });
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    await new Promise<void>((resolve) => server.listen(PROXY_PORT, '127.0.0.1', resolve));
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      for (const socket of this.sockets) socket.destroy();
    });
  }
}

/** Real signed Pro pass (7-day token, 3 offline days) made with the run's throwaway key. */
export async function mintProPass(deviceId: string, now = new Date()): Promise<string> {
  const token = await issueToken(process.env.MB_OFFLINE_E2E_SIGNING_KEY, {
    licenseId: `e2e-offline-${deviceId}`,
    grants: ['white', 'student', 'coach', 'pro', 'media'],
    tier: 'pro',
    src: 'stripe',
    deviceId,
    now,
    kind: 'pro',
    subs: { state: 'active' },
    appVersion: '999.0.0',
  });
  if (!token) throw new Error('could not mint the throwaway test pass');
  return token;
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  }
}

/** Precache entry count, so a test knows the install finished. */
export async function precacheCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    let count = 0;
    for (const name of await caches.keys()) {
      if (name.includes('precache')) count += (await (await caches.open(name)).keys()).length;
    }
    return count;
  });
}

/** Install the app, put a real pass on the browser, and let the paid screens save. */
export async function installWithPass(context: BrowserContext): Promise<{ page: Page; token: string }> {
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await waitForServiceWorker(page);
  const deviceId = `e2e-${Math.random().toString(36).slice(2)}`;
  const token = await mintProPass(deviceId);
  await page.evaluate(
    ({ deviceId, token }) => {
      localStorage.setItem('advantage.device.id', deviceId);
      localStorage.setItem('advantage.entitlement.token', token);
      localStorage.setItem('advantage.legacyNoticeDismissed', '1');
      localStorage.setItem('matboard.tvTip.v1', '1');
    },
    { deviceId, token },
  );
  await page.reload();
  // The offline launch has to verify this pass from the saved public key.
  // A missing key, or a pass the check deleted, must fail here rather than hang.
  await page.waitForFunction(() => {
    const token = localStorage.getItem('advantage.entitlement.token');
    const config = localStorage.getItem('advantage.entitlement.config') ?? '';
    return Boolean(token) && config.includes('"kty"');
  });
  // A Pro pass may open every paid screen: wait until each listed file is saved.
  const files = Object.keys(((await (await page.request.get(`${BASE}/paid/manifest.json`)).json()) as { files: object }).files);
  await page.waitForFunction(async (expected) => {
    const cache = await caches.open('paid-chunks');
    const saved = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
    return expected.every((name) => saved.has(`/paid/${name}`));
  }, files);
  return { page, token };
}

/** The browser's front door is gone. context.setOffline alone does not stop the worker. */
export async function assertProxyDown(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: PROXY_PORT });
    const finish = (error?: Error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.on('connect', () => finish(new Error('offline test left the server accepting connections')));
    socket.on('error', () => finish());
  });
}

/** Every URL the tab passed through, client-side redirects included. */
export function trackUrls(page: Page): string[] {
  const seen: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) seen.push(new URL(frame.url()).pathname);
  });
  return seen;
}

export const BOUNCE = /^\/(?:buy|coming-soon)/;
