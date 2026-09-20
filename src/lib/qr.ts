import { toDataURL } from 'qrcode';

/** High-contrast QR for a gym TV. Stays on-device — no network lookup. */
export async function qrDataUrl(text: string): Promise<string> {
  return toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
    color: {
      dark: '#10131a',
      light: '#ffffff',
    },
  });
}
