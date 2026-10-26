import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { renderHalfOffDocument } from '../lib/halfOffPage.ts';

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../pages/halfOff.css');

function halfOffCss(): string {
  return readFileSync(cssPath, 'utf8');
}

function isHalfOffPath(url: string | undefined): boolean {
  const path = url?.split('?')[0] ?? '';
  return path === '/half-off' || path === '/half-off/';
}

const serveHalfOff: Connect.NextHandleFunction = (req, res, next) => {
  if (!isHalfOffPath(req.url)) {
    next();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(renderHalfOffDocument(halfOffCss()));
};

/**
 * Serves /half-off and /half-off/ as one HTML file in dev and preview.
 * The production build emits half-off.html and half-off/index.html.
 * Cloudflare Pages serves those files at /half-off and /half-off/.
 * Do not add a _redirects rewrite from /half-off to /half-off.html; Pages
 * redirects the .html URL back to /half-off and the pair loops.
 */
export function halfOffPagePlugin(): Plugin {
  return {
    name: 'advantage-half-off-page',
    configureServer(server) {
      server.middlewares.use(serveHalfOff);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveHalfOff);
    },
    generateBundle() {
      const source = renderHalfOffDocument(halfOffCss());
      this.emitFile({ type: 'asset', fileName: 'half-off.html', source });
      this.emitFile({ type: 'asset', fileName: 'half-off/index.html', source });
    },
  };
}
