import jsQR from 'jsqr';

export type QrImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/** Read one QR from raw pixels. Returns the text inside, or null. */
export function decodeQrImageData(image: QrImage): string | null {
  if (image.width < 21 || image.height < 21) return null;
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
  const text = code?.data?.replace(/\s+/g, ' ').trim() ?? '';
  return text || null;
}
