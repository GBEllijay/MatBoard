/**
 * The corner Back control is the penalty fist, not the Advantage logo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PENALTY_BACK_SRC, BackButton } from './BackButton.tsx';
import { HistoryBackMark } from './HistoryBackMark.tsx';
import { BACK_BUTTON_PREVIEW_PATH, BackButtonPreviewPage } from '../preview/backButton/BackButtonPreview.tsx';
import { HeaderAccount } from './HeaderAccount.tsx';

const historyBack = readFileSync('src/components/HistoryBackMark.tsx', 'utf8');
const playExit = readFileSync('src/components/PlayExitMark.tsx', 'utf8');
const homeMark = readFileSync('src/components/HomeMark.tsx', 'utf8');
const tierHome = readFileSync('src/components/TierHomeMark.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');
const header = readFileSync('src/components/HeaderAccount.tsx', 'utf8');
const homePage = readFileSync('src/pages/Home.tsx', 'utf8');

const dom = new Window({ url: `http://localhost${BACK_BUTTON_PREVIEW_PATH}` });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('SVGElement', view.SVGElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path = BACK_BUTTON_PREVIEW_PATH): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

test('HistoryBackMark and PlayExitMark use the shared BackButton, not the Advantage logo', () => {
  assert.match(historyBack, /aria-label="Back"/);
  assert.match(historyBack, /<BackButton \/>/);
  assert.doesNotMatch(historyBack, /advantage-icon\.png/);
  assert.match(playExit, /<BackButton \/>/);
  assert.doesNotMatch(playExit, /advantage-icon\.png/);
  assert.match(homeMark, /advantage-icon\.png/);
  assert.match(tierHome, /advantage-icon\.png/);
  assert.doesNotMatch(homeMark, /<BackButton/);
  assert.doesNotMatch(tierHome, /<BackButton/);
});

test('the Back button keeps the 44px mark, a 64px-wide tap target, and a visible Back label', () => {
  assert.match(css, /--mark-back:\s*44px;/);
  const hit = css.slice(css.indexOf('\n.play-exit {'), css.indexOf('\n.play-exit .back-btn {'));
  assert.match(hit, /width:\s*64px;/);
  assert.match(hit, /min-height:\s*64px;/);
  assert.match(css, /\.play-exit \.back-btn img,[\s\S]*width:\s*var\(--mark-back\)/);
  assert.match(css, /\.back-btn__label \{/);
});

test('the preview route is registered and shows the Back mark beside the Home logo', () => {
  assert.equal(BACK_BUTTON_PREVIEW_PATH, '/preview/back-button');
  assert.equal(PENALTY_BACK_SRC, '/advantage-penalty-icon.png');
  assert.match(app, /BACK_BUTTON_PREVIEW_PATH/);
  assert.match(app, /BACK_BUTTON_LAYOUT_PREVIEW_PATH/);
  assert.match(app, /BackButtonLayoutPreviewPage/);
  assert.match(app, /BackButtonPreviewPage/);

  const { root, host } = mount(<BackButtonPreviewPage />);
  assert.match(host.textContent ?? '', /Preview only/);
  assert.match(host.textContent ?? '', /Home logo/);
  assert.match(host.textContent ?? '', /Back mark/);
  assert.doesNotMatch(host.textContent ?? '', /muted penalty red/i);
  assert.doesNotMatch(host.textContent ?? '', /navy and cream/i);
  const logos = host.querySelectorAll('img[src="/advantage-icon.png"]');
  const backs = host.querySelectorAll('img[src="/advantage-penalty-icon.png"]');
  assert.ok(logos.length >= 2);
  assert.ok(backs.length >= 2);
  assert.ok(host.querySelector('.bb-preview__header--dark'));
  assert.ok(host.querySelector('.bb-preview__header--light'));
  const sampleBacks = host.querySelectorAll('a[aria-label="Back"] .back-btn img');
  assert.ok(sampleBacks.length >= 2);
  const sampleLabels = host.querySelectorAll('a[aria-label="Back"] .back-btn__label');
  assert.ok(sampleLabels.length >= 2);
  for (const label of sampleLabels) assert.equal(label.textContent, 'Back');
  const home = host.querySelector('.tier-home');
  assert.ok(home);
  assert.equal(home?.getAttribute('aria-label'), 'Home');
  assert.ok(home?.querySelector('img[src="/advantage-icon.png"]'));
  root.unmount();
  host.remove();
});

test('BackButton renders the 44px penalty badge and hides it from the accessibility tree', () => {
  const { root, host } = mount(<BackButton />);
  const wrap = host.querySelector('.back-btn');
  assert.ok(wrap);
  assert.equal(wrap?.getAttribute('aria-hidden'), 'true');
  const img = wrap?.querySelector('img');
  assert.ok(img);
  assert.equal(img?.getAttribute('src'), PENALTY_BACK_SRC);
  assert.equal(img?.getAttribute('width'), '44');
  assert.equal(img?.getAttribute('height'), '44');
  assert.equal(img?.getAttribute('alt'), '');
  const label = wrap?.querySelector('.back-btn__label');
  assert.ok(label);
  assert.equal(label?.textContent, 'Back');
  root.unmount();
  host.remove();
});

test('HistoryBackMark keeps aria-label Back and the same fallback link', () => {
  const { root, host } = mount(<HistoryBackMark fallback="/" />, '/products');
  const link = host.querySelector('a.play-exit--history');
  assert.ok(link);
  assert.equal(link?.getAttribute('aria-label'), 'Back');
  assert.equal(link?.getAttribute('href'), '/');
  assert.ok(link?.querySelector(`.back-btn img[src="${PENALTY_BACK_SRC}"]`));
  assert.equal(link?.querySelector('.back-btn__label')?.textContent, 'Back');
  assert.equal(link?.querySelectorAll('img[src="/advantage-icon.png"]').length, 0);
  root.unmount();
  host.remove();
});

test('App mounts HeaderAccount and skips the storefront and the TV display', () => {
  assert.match(app, /import \{ HeaderAccount \} from '\.\/components\/HeaderAccount'/);
  assert.match(app, /<HeaderAccount \/>/);
  assert.match(header, /HIDDEN_PATHS = new Set\(\['\/', '\/match', '\/training', '\/white'\]\)/);
  assert.match(header, /readLoginHint/);
  assert.match(header, /LOGIN_EVENT/);
  assert.match(header, /aria-label=\{hint \? 'Account' : 'Sign in'\}/);
  assert.match(header, /className="header-account"/);
  assert.match(css, /\.header-account \{/);
  assert.match(css, /position:\s*fixed/);
});

test('the Back mark is pinned top-left so it cannot drift in the Instructor grid gutter', () => {
  const rule = css.slice(css.indexOf('/* Page back mark.'), css.indexOf('.play-exit img,'));
  assert.match(rule, /position:\s*fixed;/);
  assert.match(rule, /top:\s*calc\(0\.2rem \+ var\(--safe-t\)\)/);
  assert.match(rule, /left:\s*calc\(0\.15rem \+ var\(--safe-l\)\)/);
});

test('suite pages keep the Home logo centered over the Advantage wordmark at every wide width', () => {
  assert.match(
    css,
    /\.home__inner:has\(> \.suite > \.belt-header\) > \.home__mark \{[^}]*text-align:\s*center;/,
  );
  assert.match(
    css,
    /\.home__inner:has\(> \.suite > \.belt-header\) > \.home__mark \.home__logo \{[^}]*margin-inline:\s*auto;|\.home__inner:has\(> \.suite > \.belt-header\) > \.home__mark \.home__logo \{[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto;/,
  );
  // The old cap at 1400px left the logo left-aligned on a slightly wider window.
  assert.doesNotMatch(css, /max-width:\s*1400px\) \{\s*\.home__inner:has\(> \.play-exit\)/);
});

test('HeaderAccount is hidden on the storefront and shows Sign in on other pages', () => {
  const { root, host } = mount(<HeaderAccount />, '/');
  assert.equal(host.querySelector('.header-account'), null);
  root.unmount();
  host.remove();

  const mounted = mount(<HeaderAccount />, '/coach-unlimited');
  const link = mounted.host.querySelector('a.header-account');
  assert.ok(link);
  assert.equal(link?.getAttribute('href'), '/account');
  assert.equal(link?.getAttribute('aria-label'), 'Sign in');
  assert.match(link?.textContent ?? '', /Sign in/);
  mounted.root.unmount();
  mounted.host.remove();
});

test('HeaderAccount is hidden on /white and still shows on other app pages', () => {
  const white = mount(<HeaderAccount />, '/white');
  assert.equal(white.host.querySelector('.header-account'), null);
  white.root.unmount();
  white.host.remove();

  for (const path of ['/white/roster', '/white/bracket-roster', '/white/brackets']) {
    const sub = mount(<HeaderAccount />, path);
    assert.equal(sub.host.querySelector('.header-account'), null, `Sign in should be hidden on ${path}`);
    sub.root.unmount();
    sub.host.remove();
  }

  const products = mount(<HeaderAccount />, '/products');
  assert.ok(products.host.querySelector('a.header-account'));
  products.root.unmount();
  products.host.remove();
});

test('the products page keeps mid-page Account and Sign out, and gets the pinned header too', () => {
  assert.match(homePage, /<HistoryBackMark fallback=\{PRODUCTS_PATH\} \/>/);
  assert.match(homePage, /<AccountLink \/>/);
  assert.match(homePage, /<SignOutButton \/>/);
  assert.doesNotMatch(header, /HIDDEN_PATHS = new Set\(\[[^\]]*\'\/products\'/);
  const mounted = mount(<HeaderAccount />, '/products');
  const link = mounted.host.querySelector('a.header-account');
  assert.ok(link);
  assert.equal(link?.getAttribute('href'), '/account');
  mounted.root.unmount();
  mounted.host.remove();
});

test('sample Back marks stay in their preview cards, and the layout preview uses the real suite header', () => {
  const previewCss = readFileSync('src/preview/backButton/backButtonPreview.css', 'utf8');
  const preview = readFileSync('src/preview/backButton/BackButtonPreview.tsx', 'utf8');
  assert.match(
    previewCss,
    /\.bb-preview__header \.play-exit,[\s\S]*position:\s*absolute;/,
  );
  assert.match(preview, /BACK_BUTTON_LAYOUT_PREVIEW_PATH = '\/preview\/back-button-layout'/);
  assert.match(preview, /home home--pro home--suite/);
  assert.match(preview, /BeltHeader kind="brown"/);
  assert.match(app, /BACK_BUTTON_LAYOUT_PREVIEW_PATH/);
});
