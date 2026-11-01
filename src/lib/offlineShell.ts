/**
 * Small browser hooks that help the installed app work offline at a gym.
 * Each one is best effort: a browser without the API is left unchanged.
 */

type DisplayEnv = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

/** Home-screen / installed-window modes from the manifest (fullscreen, standalone, …). */
export const INSTALLED_DISPLAY_MODES = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'] as const;

/** True when the app runs from an install (Android/desktop PWA, or iOS home screen). */
export function isInstalledApp(env: DisplayEnv | undefined = typeof window === 'undefined' ? undefined : (window as unknown as DisplayEnv)): boolean {
  if (!env) return false;
  try {
    if (env.navigator?.standalone === true) return true;
    if (typeof env.matchMedia !== 'function') return false;
    return INSTALLED_DISPLAY_MODES.some((mode) => env.matchMedia!(`(display-mode: ${mode})`).matches);
  } catch {
    return false;
  }
}

type StorageManagerLike = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

export type PersistResult = 'unsupported' | 'already' | 'granted' | 'denied' | 'skipped';

/**
 * Ask the browser not to evict the app's saved files (service worker cache,
 * IndexedDB, localStorage) under storage pressure. Only asked for installs, so a
 * plain browser tab is not prompted. Chrome/Edge decide silently; Safari keeps
 * home-screen apps' data while the app is installed.
 */
export async function requestPersistentStorage(
  installed: boolean = isInstalledApp(),
  storage: StorageManagerLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator.storage as StorageManagerLike | undefined),
): Promise<PersistResult> {
  if (!installed) return 'skipped';
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'already';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

type AudioSessionNavigator = { audioSession?: { type?: string } };

/**
 * iOS/iPadOS 17+ Safari: 'playback' lets the buzzer, bell, and Parou play with
 * the ring/silent switch on silent, like a media app. Other browsers do not
 * have navigator.audioSession and are left alone.
 */
export function setPlaybackAudioSession(
  nav: AudioSessionNavigator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as unknown as AudioSessionNavigator),
): boolean {
  const session = nav?.audioSession;
  if (!session || typeof session !== 'object' || !('type' in session)) return false;
  try {
    if (session.type !== 'playback') session.type = 'playback';
    return session.type === 'playback';
  } catch {
    return false;
  }
}

type InstallEventTarget = {
  addEventListener?: (type: string, listener: () => void) => void;
};

/**
 * Ask once for this launch, and again when the coach installs from this tab.
 * `ask(true)` means "this tab just became an install", even if display-mode
 * has not flipped yet. A missing event target is ignored.
 */
export function bindAppInstalledPersistence(
  ask: (installed?: boolean) => void,
  target: InstallEventTarget | undefined,
): void {
  ask();
  try {
    target?.addEventListener?.('appinstalled', () => ask(true));
  } catch {
    /* a browser without the event is unchanged */
  }
}

/** Persistent storage for an installed window, including an install that happens on this visit. */
export function watchInstalledPersistence(
  target: InstallEventTarget | undefined = typeof window === 'undefined' ? undefined : window,
): void {
  bindAppInstalledPersistence((installed) => {
    void requestPersistentStorage(installed).catch(() => undefined);
  }, target);
}
