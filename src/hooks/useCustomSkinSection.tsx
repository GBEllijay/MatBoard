import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SkinPickerOption } from '../components/SkinPicker';
import {
  CUSTOM_SKIN_DELETE_FIRST,
  customSkinRecordId,
  customSkinValue,
  customSkinsAtCap,
} from '../lib/customSkin';
import { dispatchMatch, getMatch } from '../lib/matchStore';
import { DEFAULT_SCOREBOARD_SKIN } from '../lib/scoreboardSkin';
import { getTrainingSkin, setTrainingSkin } from '../lib/trainingSkin';
import { installCustomSkinSync, pullCustomSkins } from '../lib/customSkinInstall';
import {
  deleteCustomSkin,
  hydrateCustomSkins,
  listCustomSkins,
  readCustomSkin,
  renameCustomSkin,
  saveCustomSkinFromFile,
  subscribeCustomSkins,
} from '../lib/customSkinStore';

const EMPTY_THUMB =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * My skins for the shared picker. Hidden entirely below Media Edition:
 * callers pass enabled only when polished skins are open.
 */
export function useCustomSkinSection(enabled: boolean, onPick: (skinValue: string) => void): {
  options: SkinPickerOption[];
  showMine: boolean;
  mineExtra: ReactNode;
  renderTileExtra?: (option: SkinPickerOption) => ReactNode;
} {
  const summaries = useSyncExternalStore(subscribeCustomSkins, listCustomSkins, listCustomSkins);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!enabled) return;
    installCustomSkinSync();
    void hydrateCustomSkins();
    void pullCustomSkins();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const created: string[] = [];
    void (async () => {
      const next: Record<string, string> = {};
      for (const skin of summaries) {
        const record = await readCustomSkin(skin.id);
        if (!live || !record) continue;
        const url = URL.createObjectURL(record.thumb);
        created.push(url);
        next[skin.id] = url;
      }
      if (live) setThumbs(next);
    })();
    return () => {
      live = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [enabled, summaries]);

  if (!enabled) return { options: [], showMine: false, mineExtra: null };

  const full = customSkinsAtCap(summaries.length);
  const options: SkinPickerOption[] = summaries.flatMap((skin) => {
    const id = customSkinValue(skin.id);
    if (!id) return [];
    return [{ id, label: skin.name, thumb: thumbs[skin.id] ?? EMPTY_THUMB, section: 'mine' as const }];
  });

  const onFile = (file: File | undefined) => {
    if (!file || full) return;
    void saveCustomSkinFromFile(file).then((saved) => {
      if (!saved.ok) {
        setNote(saved.error);
        return;
      }
      setNote('');
      const value = customSkinValue(saved.summary.id);
      if (value) onPick(value);
    });
  };

  return {
    options,
    showMine: true,
    mineExtra: (
      <label className={`skin-pick__upload${full ? ' is-full' : ''}`}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          disabled={full}
          aria-label={full ? CUSTOM_SKIN_DELETE_FIRST : 'Upload skin'}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            onFile(file);
          }}
        />
        <span>{full ? CUSTOM_SKIN_DELETE_FIRST : note || 'Upload skin'}</span>
      </label>
    ),
    renderTileExtra: (option) => {
      const id = customSkinRecordId(option.id);
      if (!id) return null;
      return (
        <>
          <input
            className="skin-pick__rename"
            aria-label={`Rename ${option.label}`}
            defaultValue={option.label}
            maxLength={40}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onBlur={(event) => {
              const next = event.currentTarget.value;
              if (next.trim() && next.trim() !== option.label) void renameCustomSkin(id, next);
            }}
          />
          <button
            type="button"
            className="skin-pick__delete"
            aria-label={`Delete ${option.label}`}
            onClick={(event) => {
              event.stopPropagation();
              const value = customSkinValue(id);
              void deleteCustomSkin(id).then(() => {
                if (!value) return;
                if (getTrainingSkin() === value) setTrainingSkin('classic');
                if (getMatch().skin === value) dispatchMatch({ type: 'setSkin', value: DEFAULT_SCOREBOARD_SKIN });
              });
            }}
          >
            Delete
          </button>
        </>
      );
    },
  };
}
