import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCastSlides, type ShopSlideItem } from './shopSlides.ts';
import {
  DEFAULT_EVENTS_CAST_MODE,
  EVENT_QR_CAP,
  EVENTS_CAST_MODE_OPTIONS,
  normalizeEventsCastMode,
  normalizeQrLinks,
  qrLinkCaption,
} from './eventSlides.ts';

test('Events cast modes match Pro Shop: images, images + QR, images + QR + logo', () => {
  assert.deepEqual(
    EVENTS_CAST_MODE_OPTIONS.map((option) => option.label),
    ['Images only', 'Images + QR', 'Images + QR + logo'],
  );
  assert.equal(DEFAULT_EVENTS_CAST_MODE, 'images-qr');
  assert.equal(normalizeEventsCastMode('images'), 'images');
  assert.equal(normalizeEventsCastMode('images-qr-logo'), 'images-qr-logo');
  assert.equal(normalizeEventsCastMode('nope'), 'images-qr');
  assert.equal(normalizeEventsCastMode(undefined), 'images-qr');
});

test('event QR links trim, add https, drop blanks, and cap the list', () => {
  assert.deepEqual(normalizeQrLinks(['  gym.example/register  ', '', '   ']), [
    'https://gym.example/register',
  ]);
  assert.deepEqual(normalizeQrLinks('https://gym.example/register'), []);
  assert.deepEqual(
    normalizeQrLinks(['https://gym.example/register', 'https://gym.example/register']),
    ['https://gym.example/register'],
  );
  const many = Array.from({ length: EVENT_QR_CAP + 3 }, (_, index) => `gym.example/link-${index}`);
  assert.equal(normalizeQrLinks(many).length, EVENT_QR_CAP);
  assert.equal(normalizeQrLinks([` ${'a'.repeat(800)} `])[0]?.length, 500);
});

test('QR captions use the last path piece, or the host when there is no path', () => {
  assert.equal(qrLinkCaption('https://smoothcomp.com/en/event/123/register'), 'register');
  assert.equal(qrLinkCaption('gym.example/brackets'), 'brackets');
  assert.equal(qrLinkCaption('https://tickets.example'), 'tickets.example');
  assert.equal(qrLinkCaption(''), '');
});

test('an event photo stays one TV page and does not join a Pro Shop slide', () => {
  const event: ShopSlideItem = { id: 'open', folderId: 'events', startsSlide: false };
  const shop: ShopSlideItem = { id: 'gi', folderId: 'shop', startsSlide: false };
  const slides = buildCastSlides([event, shop], [shop]);
  assert.deepEqual(
    slides.map((slide) => (slide.kind === 'shop' ? slide.items.map((item) => item.id) : slide.id)),
    ['open', ['gi']],
  );
});
