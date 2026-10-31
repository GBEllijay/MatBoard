/**
 * /media-edition renders: title, $29.99 one-time, purple belt, alpha CTA, the
 * white band, and the gallery in order. The homepage Media card opens it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MediaEditionPage } from './MediaEdition.tsx';
import { StorefrontPage } from './Storefront.tsx';

const dom = new Window({ url: 'http://localhost/media-edition' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let path = '';
function Where() {
  path = useLocation().pathname;
  return null;
}

function mount(entry: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/" element={<StorefrontPage />} />
          <Route path="/media-edition" element={<MediaEditionPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test('route renders the Media Edition page with its title, price, belt and CTA', () => {
  const m = mount('/media-edition');
  const { host } = m;
  assert.equal(document.title, 'Advantage Media Edition');
  assert.ok(host.querySelector('main.home--media'));
  assert.equal(host.querySelector('header.buy__card--belt h2')?.textContent, 'Advantage Media Edition');
  const price = host.querySelector('header .buy__price')?.textContent ?? '';
  assert.match(price, /^\$29\.99 USD — one-time/);
  assert.ok(host.querySelector('header .belt-tip.belt-tip--purple'));
  const cta = host.querySelector('a.btn.btn--white') as HTMLAnchorElement | null;
  assert.equal(cta?.textContent, 'Request an alpha code');
  assert.match(cta?.getAttribute('href') ?? '', /^mailto:advantageappllc@gmail\.com/);
  assert.match(host.textContent ?? '', /Media Edition is in alpha testing\. Email advantageappllc@gmail\.com to request an alpha code\./);
  assert.match(host.textContent ?? '', /Includes everything in Advantage White\./);
  // Not for sale: no checkout form or buy button on the page.
  assert.equal(host.querySelector('form'), null);
  for (const b of host.querySelectorAll('button')) assert.doesNotMatch(b.textContent ?? '', /buy|checkout|pay|purchase/i);
  assert.doesNotMatch(host.innerHTML, /checkout\.stripe|\/api\/.*checkout/i);
  m.done();
});

test('white band then gallery, images in order', () => {
  const m = mount('/media-edition');
  const { host } = m;
  const band = host.querySelector('section.media-band');
  const gallery = host.querySelector('section.media-gallery');
  assert.ok(band && gallery);
  assert.equal(band.nextElementSibling, gallery);
  assert.ok(band.querySelector('.media-band__notebook .media-band__stamp'));
  assert.deepEqual(
    [...band.querySelectorAll('img')].map((i) => i.getAttribute('src')),
    ['/storefront/scoreboard.png', '/storefront/round-timer.png'],
  );
  const items = [...gallery.querySelectorAll('.media-gallery__grid > li img')];
  assert.deepEqual(
    items.map((i) => i.getAttribute('src')),
    ['/homepage/woodblock-scoreboard.jpg', '/homepage/woodblock-timer.jpg', '/storefront/round-timer-live.png'],
  );
  for (const img of items) assert.ok((img.getAttribute('alt') ?? '').length > 10);
  m.done();
});

test('feature list renders the real Media Console features', () => {
  const m = mount('/media-edition');
  const titles = [...m.host.querySelectorAll('.media-edition__features strong')].map((n) => n.textContent);
  assert.deepEqual(titles, ['Gallery', 'Class Schedule', 'Pro Shop', 'Events', 'Play order and timing', 'Video sound', 'Gym logo', 'Stays on this device']);
  const included = [...m.host.querySelectorAll('.buy__block ul li')].map((n) => n.textContent);
  assert.deepEqual(included, ['Tournament Style BJJ Scoreboard', 'Fully Customizable Round Timer', 'Media Console']);
  m.done();
});

test('homepage Media Edition card links to /media-edition and lands on the page', () => {
  const m = mount('/');
  const links = [...m.host.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/media-edition');
  assert.equal(links.length, 1);
  assert.match(links[0].textContent ?? '', /Advantage Media Edition/);
  act(() => {
    links[0].dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
  });
  assert.equal(path, '/media-edition');
  assert.equal(m.host.querySelector('header.buy__card--belt h2')?.textContent, 'Advantage Media Edition');
  m.done();
});
