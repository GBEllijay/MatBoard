/**
 * Open a phone still for on-device resize.
 * The full-size decoder is tried first. A smaller decode is next, because a
 * large camera photo can be rejected before it ever reaches the canvas.
 * An Image element is the fallback when createImageBitmap is missing or
 * rejects the file. Nothing here calls the network.
 */

const DOWNSAMPLED_EDGE = 1600;
/** A decoder that never answers should not leave the picker hanging. */
const IMAGE_DECODE_MS = 4000;

export type StillSource = {
  width: number;
  height: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) => void;
  close: () => void;
};

async function bitmapFrom(file: File, options?: ImageBitmapOptions): Promise<ImageBitmap | null> {
  try {
    const bitmap = options ? await createImageBitmap(file, options) : await createImageBitmap(file);
    if (bitmap.width > 0 && bitmap.height > 0) return bitmap;
    bitmap.close();
  } catch {
    /* This decoder could not take the file. Try the next one. */
  }
  return null;
}

async function openBitmap(file: File): Promise<StillSource | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const attempts: Array<ImageBitmapOptions | undefined> = [
    { imageOrientation: 'from-image' },
    undefined,
    { imageOrientation: 'from-image', resizeWidth: DOWNSAMPLED_EDGE, resizeQuality: 'medium' },
    { resizeWidth: DOWNSAMPLED_EDGE, resizeQuality: 'medium' },
  ];
  for (const options of attempts) {
    const bitmap = await bitmapFrom(file, options);
    if (!bitmap) continue;
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
        ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
      },
      close: () => bitmap.close(),
    };
  }
  return null;
}

function openHtmlImage(file: File): Promise<HTMLImageElement | null> {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  const ImageCtor = globalThis.Image;
  if (typeof ImageCtor !== 'function') return Promise.resolve(null);
  let url = '';
  try {
    url = URL.createObjectURL(file);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const image = new ImageCtor();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* The object URL was already released. */
      }
      resolve(value);
    };
    timer = setTimeout(() => finish(null), IMAGE_DECODE_MS);
    image.onload = () => {
      finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    };
    image.onerror = () => finish(null);
    try {
      image.src = url;
    } catch {
      finish(null);
    }
  });
}

/** Throws `undecodable` when no decoder on this phone can read the file. */
export async function openStill(file: File): Promise<StillSource> {
  const bitmap = await openBitmap(file);
  if (bitmap) return bitmap;
  const image = await openHtmlImage(file);
  if (!image) throw new Error('undecodable');
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    },
    close: () => {
      image.src = '';
    },
  };
}

export function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((result) => resolve(result && result.size > 0 ? result : null), mime, quality);
    } catch {
      resolve(null);
    }
  });
}
