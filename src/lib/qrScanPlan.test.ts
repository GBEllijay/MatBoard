import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from 'qrcode';
import { academyPathway, academyPathwayUrl } from './academyPathway.ts';
import { decodeQrImageData, type QrImage } from './qrScan.ts';
import {
  FALLBACK_SCAN_MAX,
  SCAN_CHECKING,
  SCAN_GOT,
  SCAN_LOOKING,
  SCAN_SLOW,
  decodeRegions,
  isAppleMobile,
  scanFeedback,
  scanRegions,
  type ScanRegion,
} from './qrScanPlan.ts';

/** A big grey "photo" with a QR (modulePx per module) painted in the middle. */
function photoWithQr(text: string, width: number, height: number, modulePx: number): QrImage {
  const symbol = create(text, { errorCorrectionLevel: 'M' });
  const size = symbol.modules.size;
  const qrPx = (size + 8) * modulePx;
  const left = Math.floor((width - qrPx) / 2);
  const top = Math.floor((height - qrPx) / 2);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      let shade = 150;
      const qx = x - left;
      const qy = y - top;
      if (qx >= 0 && qy >= 0 && qx < qrPx && qy < qrPx) {
        const col = Math.floor(qx / modulePx) - 4;
        const row = Math.floor(qy / modulePx) - 4;
        const dark = col >= 0 && row >= 0 && col < size && row < size && symbol.modules.get(row, col) !== 0;
        shade = dark ? 0 : 255;
      }
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** What canvas drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh) does, with box averaging. */
function draw(image: QrImage, r: ScanRegion): QrImage {
  const out = new Uint8ClampedArray(r.dw * r.dh * 4);
  const fx = r.sw / r.dw;
  const fy = r.sh / r.dh;
  for (let y = 0; y < r.dh; y += 1) {
    const y0 = r.sy + Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, r.sy + Math.floor((y + 1) * fy));
    for (let x = 0; x < r.dw; x += 1) {
      const x0 = r.sx + Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, r.sx + Math.floor((x + 1) * fx));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          sum += image.data[(yy * image.width + xx) * 4];
          n += 1;
        }
      }
      const o = (y * r.dw + x) * 4;
      const v = sum / n;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: r.dw, height: r.dh };
}

const url = academyPathwayUrl(
  academyPathway({ provider: 'googleDrive', folderId: 'academyFolder123', folderName: 'GB Ellijay', gymName: 'GB Ellijay' })!,
  'https://advantagebjjtimer.com',
);

test('photo plan: full detail first, center crop, then the old 720px pass; every pass fits its cap', () => {
  const regions = scanRegions(4032, 3024, 'photo');
  assert.equal(regions.length, 3);
  assert.deepEqual(regions[0], { sx: 0, sy: 0, sw: 4032, sh: 3024, dw: 2000, dh: 1500 });
  assert.equal(regions[1].sw, regions[1].sh, 'center crop is square');
  assert.ok(regions[1].sx > 0 && regions[1].sy > 0);
  assert.equal(Math.max(regions[2].dw, regions[2].dh), FALLBACK_SCAN_MAX);
  // A small photo is not upscaled, and duplicate passes collapse.
  const small = scanRegions(600, 400, 'photo');
  assert.deepEqual(small[0], { sx: 0, sy: 0, sw: 600, sh: 400, dw: 600, dh: 400 });
  assert.equal(new Set(small.map((r) => JSON.stringify(r))).size, small.length);
  assert.deepEqual(scanRegions(10, 10, 'photo'), []);
});

test('live plan: 1080p frame decodes at full 1080 size plus a center square', () => {
  const regions = scanRegions(1920, 1080, 'live');
  assert.deepEqual(regions[0], { sx: 0, sy: 0, sw: 1920, sh: 1080, dw: 1080, dh: 608 });
  assert.deepEqual(regions[1], { sx: 420, sy: 0, sw: 1080, sh: 1080, dw: 1080, dh: 1080 });
  assert.equal(Math.max(regions[2].dw, regions[2].dh), FALLBACK_SCAN_MAX);
});

test('regression: a QR in a 12MP iPhone photo is lost at 720px but read by the new plan', () => {
  const photo = photoWithQr(url, 4032, 3024, 3);
  const old = scanRegions(4032, 3024, 'photo').find((r) => Math.max(r.dw, r.dh) === FALLBACK_SCAN_MAX)!;
  assert.equal(decodeQrImageData(draw(photo, old)), null, 'the old single 720px pass cannot read it');
  assert.equal(
    decodeRegions(scanRegions(4032, 3024, 'photo'), (r) => draw(photo, r)),
    url,
  );
});

test('a QR filling a live 1080p frame still reads', () => {
  const frame = photoWithQr(url, 1920, 1080, 6);
  assert.equal(
    decodeRegions(scanRegions(1920, 1080, 'live'), (r) => draw(frame, r)),
    url,
  );
});

test('feedback: looking, still looking, got it, then the page result wins; errors are alerts', () => {
  assert.equal(scanFeedback('idle'), null);
  assert.deepEqual(scanFeedback('looking'), { role: 'status', tone: 'info', text: SCAN_LOOKING });
  assert.deepEqual(scanFeedback('slow'), { role: 'status', tone: 'info', text: SCAN_SLOW });
  assert.deepEqual(scanFeedback('got'), { role: 'status', tone: 'info', text: SCAN_GOT });
  assert.deepEqual(scanFeedback('got', { kind: 'pending', text: '' }), { role: 'status', tone: 'info', text: SCAN_CHECKING });
  assert.deepEqual(scanFeedback('got', { kind: 'ok', text: 'Connected to GB Ellijay.' }), {
    role: 'status',
    tone: 'ok',
    text: 'Connected to GB Ellijay.',
  });
  assert.equal(scanFeedback('got', { kind: 'error', text: 'Nope' })?.role, 'alert');
  assert.equal(scanFeedback('looking', null, 'The camera did not open.')?.tone, 'error');
});

test('iPhone tip only on iOS (including iPadOS desktop UA)', () => {
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), true);
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isAppleMobile({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }), false);
  assert.equal(isAppleMobile(undefined), false);
});
