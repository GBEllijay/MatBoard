type FsDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

export function fullscreenElement(): Element | null {
  const doc = document as FsDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function fullscreenSupported(): boolean {
  const doc = document as FsDoc;
  return Boolean(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export async function requestPageFullscreen(): Promise<boolean> {
  const el = document.documentElement as FsEl;
  try {
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await el.requestFullscreen();
      }
      return Boolean(fullscreenElement());
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitPageFullscreen(): Promise<void> {
  const doc = document as FsDoc;
  if (!fullscreenElement()) return;
  try {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === 'function') {
      doc.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
}
