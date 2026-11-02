/**
 * Plus Cloud media rules. The gym agrees before Cloud hosting turns on.
 * Draft terms for a lawyer live in docs/legal. This file is the on-screen copy.
 */

export const MEDIA_CONDUCT_KEY = 'matboard.plusCloud.conduct.v1';
export const ABUSE_EMAIL = 'advantageappllc@gmail.com';

export const MEDIA_CONDUCT_TITLE = 'Media Center code of conduct';

export const MEDIA_CONDUCT_POINTS = [
  'No nudity or sexual content.',
  'No harassment.',
  'No illegal material.',
  'No photos of people without their permission.',
  'The gym confirms parent or guardian consent for minors.',
] as const;

export const MEDIA_CONDUCT_AGREE = 'I agree';

export function mediaConductAccepted(storage: { getItem: (key: string) => string | null } | null | undefined): boolean {
  return storage?.getItem(MEDIA_CONDUCT_KEY) === '1';
}

export function acceptMediaConduct(storage: { setItem: (key: string, value: string) => void } | null | undefined): void {
  storage?.setItem(MEDIA_CONDUCT_KEY, '1');
}

export function reportPhotoHref(photoId: string): string {
  const subject = encodeURIComponent('Report this photo');
  const body = encodeURIComponent(`Photo id: ${photoId}\n`);
  return `mailto:${ABUSE_EMAIL}?subject=${subject}&body=${body}`;
}
