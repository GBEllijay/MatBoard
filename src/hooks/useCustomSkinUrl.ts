import { useEffect, useState } from 'react';
import { readCustomSkin } from '../lib/customSkinStore';

/** Object URL for a custom skin's background. Null until the picture is on this device. */
export function useCustomSkinUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let live = true;
    let objectUrl: string | null = null;
    void readCustomSkin(id).then((record) => {
      if (!live) return;
      if (!record) {
        setUrl(null);
        return;
      }
      objectUrl = URL.createObjectURL(record.image);
      setUrl(objectUrl);
    });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url;
}
