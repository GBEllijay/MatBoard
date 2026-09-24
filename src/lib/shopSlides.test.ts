import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SHOP_CAST_MODE,
  SHOP_CAST_MODE_OPTIONS,
  SHOP_ITEM_CAP,
  buildCastSlides,
  buyLinkForQr,
  normalizeBuyUrl,
  normalizeShopCastMode,
  shopSlideNumbers,
  shopSlotsLeft,
  slideMarksForList,
  type ShopSlideItem,
} from './shopSlides.ts';

function card(
  partial: Partial<ShopSlideItem> & Pick<ShopSlideItem, 'id'>,
): ShopSlideItem {
  return {
    folderId: 'shop',
    startsSlide: true,
    ...partial,
  };
}

test('Pro Shop cast modes are images, images + QR, and images + QR + logo', () => {
  assert.deepEqual(
    SHOP_CAST_MODE_OPTIONS.map((option) => option.label),
    ['Images only', 'Images + QR', 'Images + QR + logo'],
  );
  assert.equal(DEFAULT_SHOP_CAST_MODE, 'images-qr');
  assert.equal(normalizeShopCastMode('images'), 'images');
  assert.equal(normalizeShopCastMode('images-qr-logo'), 'images-qr-logo');
  assert.equal(normalizeShopCastMode('nope'), 'images-qr');
  assert.equal(normalizeShopCastMode(undefined), 'images-qr');
});

test('buy links trim, cap length, and add https the way Class Schedule does', () => {
  assert.equal(buyLinkForQr('  gym.example/gi  '), 'https://gym.example/gi');
  assert.equal(buyLinkForQr('https://gym.example/gi'), 'https://gym.example/gi');
  assert.equal(buyLinkForQr(''), '');
  assert.equal(buyLinkForQr('   '), '');
  assert.equal(normalizeBuyUrl(12), '');
  assert.equal(normalizeBuyUrl(` ${'a'.repeat(800)} `).length, 500);
});

test('soft cap counts remaining Pro Shop cards', () => {
  assert.equal(SHOP_ITEM_CAP, 40);
  assert.equal(shopSlotsLeft(0), 40);
  assert.equal(shopSlotsLeft(39), 1);
  assert.equal(shopSlotsLeft(40), 0);
  assert.equal(shopSlotsLeft(80), 0);
});

test('a multi-card slide keeps every product instead of collapsing to one QR', () => {
  const list = [
    card({ id: 'gi', startsSlide: true }),
    card({ id: 'rash', startsSlide: false }),
    card({ id: 'tape', startsSlide: false }),
    card({ id: 'poster', startsSlide: true }),
  ];
  const slides = buildCastSlides(list, list);
  assert.equal(slides.length, 2);
  assert.equal(slides[0]?.kind, 'shop');
  if (slides[0]?.kind !== 'shop' || slides[1]?.kind !== 'shop') return;
  assert.deepEqual(
    slides[0].items.map((item) => item.id),
    ['gi', 'rash', 'tape'],
  );
  assert.equal(slides[0].items.length, 3);
  assert.deepEqual(
    slides[1].items.map((item) => item.id),
    ['poster'],
  );
});

test('a Play Off card still separates Same slide groups on the TV', () => {
  const list = [
    card({ id: 'a', startsSlide: true }),
    card({ id: 'b', startsSlide: true }),
    card({ id: 'c', startsSlide: false }),
  ];
  const queue = list.filter((item) => item.id !== 'b');
  const slides = buildCastSlides(queue, list);
  assert.equal(slides.length, 2);
  if (slides[0]?.kind !== 'shop' || slides[1]?.kind !== 'shop') return;
  assert.deepEqual(
    slides[0].items.map((item) => item.id),
    ['a'],
  );
  assert.deepEqual(
    slides[1].items.map((item) => item.id),
    ['c'],
  );
});

test('Gallery pages stay single items and do not absorb a following shop card', () => {
  const photo = card({ id: 'photo', folderId: 'gallery' });
  const shop = card({ id: 'gi', folderId: 'shop', startsSlide: false });
  const slides = buildCastSlides([photo, shop], [shop]);
  assert.deepEqual(
    slides.map((slide) => (slide.kind === 'shop' ? slide.items.map((item) => item.id) : slide.id)),
    ['photo', ['gi']],
  );
});

test('slide marks follow the visible list, including a joined run', () => {
  const marks = slideMarksForList([
    card({ id: 'a', startsSlide: false }),
    card({ id: 'b', startsSlide: false }),
    card({ id: 'c', startsSlide: true }),
  ]);
  assert.deepEqual(marks.get('a'), { slide: 1, joined: false });
  assert.deepEqual(marks.get('b'), { slide: 1, joined: true });
  assert.deepEqual(marks.get('c'), { slide: 2, joined: false });
  assert.equal(shopSlideNumbers([card({ id: 'a' }), card({ id: 'b', startsSlide: false })]).get('b'), 1);
});
