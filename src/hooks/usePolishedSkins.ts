import { useEffect, useState } from 'react';
import { polishedSkinsUnlocked, type PolishedSkinSlug } from '../lib/polishedSkins';
import { loadedPolishedSkin, loadPolishedSkin, type PolishedSkinModule } from '../skins/polished/load';
import { useSeatDoor } from './useSeatDoor';

/**
 * Media Edition and above on this browser: exactly the /media hub door
 * (mediaConsoleDoorOpen). Read only; grants nothing.
 */
export function usePolishedSkinsUnlocked(): boolean {
  return polishedSkinsUnlocked(useSeatDoor());
}

/** The skin's CSS, fonts, and decorations, loaded on first use. Null while loading. */
export function usePolishedSkinModule(slug: PolishedSkinSlug | null): PolishedSkinModule | null {
  const [mod, setMod] = useState<{ slug: PolishedSkinSlug; mod: PolishedSkinModule } | null>(() => {
    const hit = slug ? loadedPolishedSkin(slug) : null;
    return slug && hit ? { slug, mod: hit } : null;
  });
  useEffect(() => {
    if (!slug) return;
    let live = true;
    void loadPolishedSkin(slug).then((loaded) => {
      if (live) setMod({ slug, mod: loaded });
    });
    return () => {
      live = false;
    };
  }, [slug]);
  if (!slug) return null;
  if (mod?.slug === slug) return mod.mod;
  return loadedPolishedSkin(slug);
}

/** Viewport size in CSS px, for the timer rings. */
export function useViewportSize(): { w: number; h: number } {
  const read = () => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 600 : window.innerHeight,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}
