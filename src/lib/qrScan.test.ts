import assert from 'node:assert/strict';
import test from 'node:test';
import { create } from 'qrcode';
import { academyPathway, academyPathwayUrl, parseAcademyInput } from './academyPathway.ts';
import { decodeQrImageData } from './qrScan.ts';

function paint(text: string) {
  const symbol = create(text, { errorCorrectionLevel: 'M' });
  const size = symbol.modules.size;
  const margin = 4;
  const scale = 4;
  const dim = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);
  for (let y = 0; y < dim; y += 1) {
    for (let x = 0; x < dim; x += 1) {
      const col = Math.floor(x / scale) - margin;
      const row = Math.floor(y / scale) - margin;
      const dark = col >= 0 && row >= 0 && col < size && row < size && symbol.modules.get(row, col) !== 0;
      const index = (y * dim + x) * 4;
      const shade = dark ? 0 : 255;
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade;
      data[index + 3] = 255;
    }
  }
  return { data, width: dim, height: dim };
}

test('a scanned academy QR is the same pathway link a student can paste', () => {
  const pathway = academyPathway({
    provider: 'googleDrive',
    folderId: 'academyFolder123',
    folderName: 'GB Ellijay',
    gymName: 'GB Ellijay',
  });
  assert.ok(pathway);
  const url = academyPathwayUrl(pathway, 'https://advantage.test');
  const text = decodeQrImageData(paint(url));
  assert.equal(text, url);
  assert.equal(parseAcademyInput(text ?? '')?.folderId, 'academyFolder123');
  assert.equal(decodeQrImageData({ data: new Uint8ClampedArray(8), width: 2, height: 2 }), null);
});
