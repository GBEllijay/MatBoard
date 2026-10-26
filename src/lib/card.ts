/**
 * The line printed on the card.
 * Typed spelling — edit only this string. The page, meta tags, and tests read it.
 * The comma splits the layout: name large, affiliation on the next line.
 */
export const CARD_MAKER_LINE = 'Professor Justin Guise, Gracie Barra Ellijay';

/** State, smaller than the academy line. Not a street address. */
export const CARD_PLACE = 'Georgia';

export const CARD_COMPANY = 'Advantage App, LLC';

export const CARD_EMAIL = 'advantageappllc@gmail.com';

/**
 * One line, in the same words as the product:
 * White round timer, tournament brackets, Coach lesson plans, Student Edition journal.
 */
export const CARD_DESCRIPTION =
  'Advantage is a jiu-jitsu gym timer and management app: round timers, brackets, lesson plans, and a Student Edition training journal.';

export const CARD_SITE_LABEL = 'advantagebjjtimer.com';
export const CARD_SITE_URL = 'https://advantagebjjtimer.com/';
export const CARD_PAGE_URL = 'https://advantagebjjtimer.com/card';

/** Public Advantage White checkout. The storefront buy button uses this same route. */
export const CARD_SIGNUP_LABEL = 'Get Advantage';
export const CARD_SIGNUP_PATH = '/buy';

/** Student Edition preview. Tournament visitors can open the journal without a purchase. */
export const CARD_STUDENT_LABEL = 'Student Edition';
export const CARD_STUDENT_PATH = '/?student=1';

export const CARD_LOGO_WEBP = '/card-logo.webp';
export const CARD_LOGO_PNG = '/card-logo.png';
export const CARD_OG_IMAGE = `${CARD_SITE_URL.replace(/\/$/, '')}${CARD_LOGO_PNG}`;

export const CARD_DOCUMENT_TITLE = `${CARD_MAKER_LINE} — Advantage`;

/**
 * noindex: this page is a QR handout, not a search landing.
 * The storefront should stay the result for Advantage. Link-preview tags stay.
 */
export const CARD_ROBOTS = 'noindex, nofollow';

export const CARD_THEME_COLOR = '#0c2344';

export type CardMakerParts = {
  name: string;
  affiliation: string;
};

/** Name before the comma, affiliation after it. A line with no comma is the name only. */
export function cardMakerParts(line = CARD_MAKER_LINE): CardMakerParts {
  const splitAt = line.indexOf(', ');
  if (splitAt === -1) return { name: line, affiliation: '' };
  return {
    name: line.slice(0, splitAt),
    affiliation: line.slice(splitAt + 2),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type MetaAttrs = Record<string, string>;

/** Shared by the static card and the in-app fallback. */
export function cardMetaTags(): MetaAttrs[] {
  return [
    { name: 'description', content: CARD_DESCRIPTION },
    { name: 'robots', content: CARD_ROBOTS },
    { name: 'theme-color', content: CARD_THEME_COLOR },
    { property: 'og:title', content: CARD_DOCUMENT_TITLE },
    { property: 'og:description', content: CARD_DESCRIPTION },
    { property: 'og:type', content: 'profile' },
    { property: 'og:url', content: CARD_PAGE_URL },
    { property: 'og:image', content: CARD_OG_IMAGE },
    { property: 'og:image:alt', content: 'Advantage logo' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: CARD_DOCUMENT_TITLE },
    { name: 'twitter:description', content: CARD_DESCRIPTION },
    { name: 'twitter:image', content: CARD_OG_IMAGE },
  ];
}

function renderMetaTags(): string {
  return cardMetaTags()
    .map((tag) => {
      const attrs = Object.entries(tag)
        .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
        .join(' ');
      return `<meta ${attrs}>`;
    })
    .join('');
}

/** Inside `<main class="card">`. */
export function renderCardInnerHtml(): string {
  const { name, affiliation } = cardMakerParts();
  const who = affiliation
    ? `<h1 class="card__who"><span class="card__name">${escapeHtml(name)},</span> <span class="card__affiliation">${escapeHtml(affiliation)}</span></h1>`
    : `<h1 class="card__who"><span class="card__name">${escapeHtml(name)}</span></h1>`;
  return [
    '<picture class="card__mark">',
    `<source srcset="${CARD_LOGO_WEBP}" type="image/webp">`,
    `<img src="${CARD_LOGO_PNG}" alt="Advantage" width="360" height="360" decoding="async" fetchpriority="high">`,
    '</picture>',
    '<p class="card__brand">Advantage</p>',
    who,
    `<p class="card__place">${escapeHtml(CARD_PLACE)}</p>`,
    `<p class="card__company">${escapeHtml(CARD_COMPANY)}</p>`,
    `<p class="card__desc">${escapeHtml(CARD_DESCRIPTION)}</p>`,
    '<div class="card__actions">',
    `<a class="card__btn card__btn--primary" href="${escapeHtml(CARD_SIGNUP_PATH)}">${escapeHtml(CARD_SIGNUP_LABEL)}</a>`,
    `<a class="card__btn card__btn--secondary" href="${escapeHtml(CARD_STUDENT_PATH)}">${escapeHtml(CARD_STUDENT_LABEL)}</a>`,
    '</div>',
    '<div class="card__links">',
    `<a href="${escapeHtml(CARD_SITE_URL)}">${escapeHtml(CARD_SITE_LABEL)}</a>`,
    `<a href="mailto:${escapeHtml(CARD_EMAIL)}">${escapeHtml(CARD_EMAIL)}</a>`,
    '</div>',
  ].join('');
}

/** Lightweight document. No scripts and no web fonts. */
export function renderCardDocument(css: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(CARD_DOCUMENT_TITLE)}</title>`,
    renderMetaTags(),
    `<link rel="canonical" href="${escapeHtml(CARD_PAGE_URL)}">`,
    '<link rel="icon" href="/favicon.png">',
    `<style>${css}</style>`,
    '</head>',
    '<body class="card-body">',
    '<main class="card">',
    renderCardInnerHtml(),
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

/** SPA fallback when an older service worker serves the app shell for /card. */
export function installCardMeta(): () => void {
  const previousTitle = document.title;
  document.title = CARD_DOCUMENT_TITLE;
  const nodes: Element[] = [];
  for (const tag of cardMetaTags()) {
    const el = document.createElement('meta');
    for (const [key, value] of Object.entries(tag)) el.setAttribute(key, value);
    el.setAttribute('data-card-meta', '');
    document.head.appendChild(el);
    nodes.push(el);
  }
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = CARD_PAGE_URL;
  canonical.setAttribute('data-card-meta', '');
  document.head.appendChild(canonical);
  nodes.push(canonical);
  return () => {
    document.title = previousTitle;
    for (const node of nodes) node.remove();
  };
}
