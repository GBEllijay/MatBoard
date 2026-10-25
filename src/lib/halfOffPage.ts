import {
  HALF_OFF_CODE,
  HALF_OFF_DESCRIPTION,
  HALF_OFF_HOME_HREF,
  HALF_OFF_OG_IMAGE_HEIGHT,
  HALF_OFF_OG_IMAGE_URL,
  HALF_OFF_OG_IMAGE_WIDTH,
  HALF_OFF_PAGE_URL,
  HALF_OFF_STORAGE_KEY,
  HALF_OFF_TITLE,
} from './halfOff.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type MetaAttrs = Record<string, string>;

export function halfOffMetaTags(): MetaAttrs[] {
  return [
    { name: 'description', content: HALF_OFF_DESCRIPTION },
    { name: 'theme-color', content: '#08172e' },
    { property: 'og:title', content: HALF_OFF_TITLE },
    { property: 'og:description', content: HALF_OFF_DESCRIPTION },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: HALF_OFF_PAGE_URL },
    { property: 'og:image', content: HALF_OFF_OG_IMAGE_URL },
    { property: 'og:image:secure_url', content: HALF_OFF_OG_IMAGE_URL },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(HALF_OFF_OG_IMAGE_WIDTH) },
    { property: 'og:image:height', content: String(HALF_OFF_OG_IMAGE_HEIGHT) },
    { property: 'og:image:alt', content: 'Advantage half off card with code MEIA' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: HALF_OFF_TITLE },
    { name: 'twitter:description', content: HALF_OFF_DESCRIPTION },
    { name: 'twitter:image', content: HALF_OFF_OG_IMAGE_URL },
    { name: 'twitter:image:alt', content: 'Advantage half off card with code MEIA' },
  ];
}

function renderMetaTags(): string {
  return halfOffMetaTags()
    .map((tag) => {
      const attrs = Object.entries(tag)
        .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
        .join(' ');
      return `<meta ${attrs}>`;
    })
    .join('');
}

/** Hardcoded MEIA. The script does not read the address bar. */
function renderRememberScript(): string {
  const key = JSON.stringify(HALF_OFF_STORAGE_KEY);
  const code = JSON.stringify(HALF_OFF_CODE);
  return `<script>(function(){try{localStorage.setItem(${key},${code});sessionStorage.setItem(${key},${code});}catch(e){}})();</script>`;
}

export function renderHalfOffInnerHtml(): string {
  return [
    '<img class="half-off__logo" src="/card-logo.png" alt="Advantage" width="216" height="216">',
    '<h1 class="half-off__word">ADVANTAGE</h1>',
    '<p class="half-off__sub">',
    '<span>Jiu-Jitsu Round Timer, Scoreboard &amp; Journal for Students,</span>',
    '<span>Gym Management Software for Pros</span>',
    '</p>',
    '<div class="half-off__board" aria-label="Scoreboard and round timer">',
    '<div class="half-off__lane"><span class="half-off__lane-name">BLUE</span><span class="half-off__lane-score">0</span></div>',
    '<div class="half-off__clock"><span class="half-off__round">ROUND 1</span><span class="half-off__time">05:00</span></div>',
    '<div class="half-off__lane"><span class="half-off__lane-name">WHITE</span><span class="half-off__lane-score">0</span></div>',
    '</div>',
    '<p class="half-off__pill">HALF OFF CODE: MEIA</p>',
    `<a class="half-off__go" href="${escapeHtml(HALF_OFF_HOME_HREF)}">Get Advantage</a>`,
  ].join('');
}

/** Lightweight document for /half-off and /half-off/. Link-preview tags are in the HTML. */
export function renderHalfOffDocument(css: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(HALF_OFF_TITLE)}</title>`,
    renderMetaTags(),
    `<link rel="canonical" href="${escapeHtml(HALF_OFF_PAGE_URL)}">`,
    '<link rel="icon" href="/favicon.png">',
    renderRememberScript(),
    `<style>${css}</style>`,
    '</head>',
    '<body class="half-off-body">',
    '<main class="half-off">',
    renderHalfOffInnerHtml(),
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

/** SPA fallback when a cached app shell opens /half-off. */
export function installHalfOffMeta(): () => void {
  const previousTitle = document.title;
  document.title = HALF_OFF_TITLE;
  const nodes: Element[] = [];
  for (const tag of halfOffMetaTags()) {
    const el = document.createElement('meta');
    for (const [key, value] of Object.entries(tag)) el.setAttribute(key, value);
    el.setAttribute('data-half-off-meta', '');
    document.head.appendChild(el);
    nodes.push(el);
  }
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = HALF_OFF_PAGE_URL;
  canonical.setAttribute('data-half-off-meta', '');
  document.head.appendChild(canonical);
  nodes.push(canonical);
  return () => {
    document.title = previousTitle;
    for (const node of nodes) node.remove();
  };
}
