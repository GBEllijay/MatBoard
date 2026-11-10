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

export type FullscreenRequestResult = 'standard' | 'webkit' | 'unsupported';

/**
 * Fullscreen on one element so the browser URL bar and chrome leave the screen.
 * `requestFullscreen` first, then the webkit prefix. Unsupported means the
 * caller should use the fixed 100dvh cover instead.
 */
export async function requestElementFullscreen(el: HTMLElement): Promise<FullscreenRequestResult> {
  const target = el as FsEl;
  if (typeof target.requestFullscreen === 'function') {
    try {
      try {
        await target.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await target.requestFullscreen();
      }
      return fullscreenElement() ? 'standard' : 'unsupported';
    } catch {
      /* try the prefix used by older WebKit */
    }
  }
  if (typeof target.webkitRequestFullscreen === 'function') {
    try {
      target.webkitRequestFullscreen();
      return 'webkit';
    } catch {
      return 'unsupported';
    }
  }
  return 'unsupported';
}

export async function requestPageFullscreen(): Promise<boolean> {
  const result = await requestElementFullscreen(document.documentElement);
  return result !== 'unsupported';
}

type WebkitVideo = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitExitFullscreen?: () => void;
};

/** Leave iOS's video-element fullscreen so a custom Close is not left behind it. */
export function exitInlineVideoFullscreen(video: HTMLVideoElement | null | undefined): void {
  const el = video as WebkitVideo | null | undefined;
  if (!el?.webkitDisplayingFullscreen) return;
  try {
    el.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

/**
 * iOS can take the video element itself fullscreen and hide the page Close.
 * The handler should leave that mode and show the in-page controls.
 */
export function onIosVideoFullscreen(video: HTMLVideoElement, onBegin: () => void): () => void {
  const begin = () => onBegin();
  video.addEventListener('webkitbeginfullscreen', begin);
  return () => video.removeEventListener('webkitbeginfullscreen', begin);
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
