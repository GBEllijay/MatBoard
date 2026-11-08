/** Drawn example images. Not a photo from a phone. */
export function examplePhoto(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="640" height="400" fill="url(#g)"/>
    <text x="36" y="188" fill="#f5f1e8" font-family="sans-serif" font-size="42" font-weight="700">${label}</text>
    <text x="36" y="236" fill="#d7e6ff" font-family="sans-serif" font-size="22">Synthetic example</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const EXAMPLE_WHITE_PHOTOS = [
  examplePhoto('White belt', '#2a5cf0', '#0c2344'),
  examplePhoto('White 2', '#6b2d91', '#1a1030'),
  examplePhoto('White 3', '#6b3a1f', '#1a0c08'),
];

export const EXAMPLE_BLUE_PHOTO = examplePhoto('Blue belt', '#123a8a', '#07111f');
