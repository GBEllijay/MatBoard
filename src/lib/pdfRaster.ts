/**
 * Turn a stored still into a PDF image.
 * Uses the canvas on this phone. A data URL is decoded locally. No upload.
 */

import type { PdfImageAsset } from './simplePdf.ts';

export const PDF_SELFIE_ID = 'Selfie';
export const PDF_GYM_LOGO_ID = 'GymLogo';

export async function flateHex(bytes: Uint8Array): Promise<string> {
  if (typeof CompressionStream !== 'function') return '';
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  let hex = '';
  for (const byte of compressed) hex += byte.toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

export async function pdfImageFromRgb(id: string, width: number, height: number, rgb: Uint8Array): Promise<PdfImageAsset | null> {
  if (width < 1 || height < 1 || rgb.length < width * height * 3) return null;
  const hex = await flateHex(rgb.subarray(0, width * height * 3));
  if (!hex) return null;
  return { id, width, height, flateHex: hex };
}

function dataUrlBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.startsWith('data:image/')) return null;
  const meta = dataUrl.slice(5, comma);
  const mime = meta.split(';')[0] || 'image/jpeg';
  try {
    const binary = atob(dataUrl.slice(comma + 1).replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Decode a stored still into a DeviceRGB PDF image. Null when this runtime cannot paint it. */
export async function pdfImageFromDataUrl(id: string, dataUrl: string): Promise<PdfImageAsset | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  const blob = dataUrlBlob(dataUrl);
  if (!blob) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const edge = 160;
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, edge, edge);
  const scale = Math.min(edge / bitmap.width, edge / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  ctx.drawImage(bitmap, (edge - width) / 2, (edge - height) / 2, width, height);
  bitmap.close?.();
  const pixels = ctx.getImageData(0, 0, edge, edge).data;
  const rgb = new Uint8Array(edge * edge * 3);
  for (let index = 0; index < edge * edge; index += 1) {
    rgb[index * 3] = pixels[index * 4] ?? 0;
    rgb[index * 3 + 1] = pixels[index * 4 + 1] ?? 0;
    rgb[index * 3 + 2] = pixels[index * 4 + 2] ?? 0;
  }
  return pdfImageFromRgb(id, edge, edge, rgb);
}

export async function reportHeaderArt(input: {
  selfie: string | null;
  gymLogo: string | null;
}): Promise<{ selfie: PdfImageAsset | null; gymLogo: PdfImageAsset | null }> {
  const selfie = input.selfie ? await pdfImageFromDataUrl(PDF_SELFIE_ID, input.selfie) : null;
  const gymLogo = input.gymLogo ? await pdfImageFromDataUrl(PDF_GYM_LOGO_ID, input.gymLogo) : null;
  return { selfie, gymLogo };
}
