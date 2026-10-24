import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { renderCardDocument } from '../lib/card.ts';

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../pages/card.css');

function cardCss(): string {
  return readFileSync(cssPath, 'utf8');
}

function isCardPath(url: string | undefined): boolean {
  const path = url?.split('?')[0] ?? '';
  return path === '/card' || path === '/card/';
}

const serveCard: Connect.NextHandleFunction = (req, res, next) => {
  if (!isCardPath(req.url)) {
    next();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(renderCardDocument(cardCss()));
};

/** Serves /card as one HTML file in dev, preview, and the production build. */
export function cardPagePlugin(): Plugin {
  return {
    name: 'advantage-card-page',
    configureServer(server) {
      server.middlewares.use(serveCard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveCard);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'card.html',
        source: renderCardDocument(cardCss()),
      });
    },
  };
}
