import { create, toDataURL, type QRCodeErrorCorrectionLevel } from 'qrcode';

/**
 * QR settings shared by every on-screen code (instructor invite, coach connect, academy
 * pathway, schedule, event and Pro Shop cast slides, student ID, license share).
 *
 * QUIET_ZONE: the QR spec asks for 4 white modules around the code. With 1, phone cameras
 * could not find the finder squares on the invite card (the owner's Nov 18 screenshot).
 * QR_MIN_PIXELS: raster size floor, so a 260 CSS px code on a DPR 3 phone stays sharp.
 * Each module is a whole number of pixels (integer scale), so edges never blur.
 */
export const QR_QUIET_ZONE = 4;
export const QR_ERROR_CORRECTION: QRCodeErrorCorrectionLevel = 'M';
export const QR_MIN_PIXELS = 780;

/** Modules across the code, quiet zone included. */
export function qrModuleCount(text: string): number {
  return create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION }).modules.size + QR_QUIET_ZONE * 2;
}

/** Whole-pixel scale that makes the image at least QR_MIN_PIXELS wide. */
export function qrScale(text: string): number {
  return Math.max(4, Math.ceil(QR_MIN_PIXELS / qrModuleCount(text)));
}

/** High-contrast QR for a phone or gym TV. Stays on-device — no network lookup. */
export async function qrDataUrl(text: string): Promise<string> {
  return toDataURL(text, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_QUIET_ZONE,
    scale: qrScale(text),
    color: {
      dark: '#10131a',
      light: '#ffffff',
    },
  });
}
