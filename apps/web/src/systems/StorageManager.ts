import { sanitizeName, type Outfit } from '@lofi/shared';
import { useSyncExternalStore } from 'react';

export const STORAGE_KEY = 'lofi-forest:v1';

export interface ProfilePrefs {
  name: string;
  outfit: Outfit;
}

export interface VolumePrefs {
  master: number;
  music: number;
  rain: number;
  campfire: number;
  ambience: number;
}

export type PomoPreset = '25/5' | '50/10' | 'custom';

export interface PomoPrefs {
  preset: PomoPreset;
  focusMin: number;
  breakMin: number;
}

export type ZoomLevel = 'auto' | 2 | 3 | 4;

export interface StoragePrefs {
  profile: ProfilePrefs;
  unlockedLandmarks: string[];
  volumes: VolumePrefs;
  pomo: PomoPrefs;
  zoom: ZoomLevel;
  showNames: boolean;
}

export const DEFAULT_OUTFIT: Outfit = {
  baseId: 'default',
  hatId: 'none',
  colorHex: '#ffffff',
};

export const DEFAULT_PREFERENCES: StoragePrefs = {
  profile: {
    name: 'Wanderer',
    outfit: { ...DEFAULT_OUTFIT },
  },
  unlockedLandmarks: ['forest_clearing'],
  volumes: {
    master: 0.8,
    music: 0.6,
    rain: 0.5,
    campfire: 0.5,
    ambience: 0.5,
  },
  pomo: {
    preset: '25/5',
    focusMin: 25,
    breakMin: 5,
  },
  zoom: 'auto',
  showNames: true,
};

export function clonePrefs(prefs: StoragePrefs): StoragePrefs {
  return {
    profile: {
      name: prefs.profile.name,
      outfit: { ...prefs.profile.outfit },
    },
    unlockedLandmarks: [...prefs.unlockedLandmarks],
    volumes: { ...prefs.volumes },
    pomo: { ...prefs.pomo },
    zoom: prefs.zoom,
    showNames: prefs.showNames,
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? U[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export type StorageListener = (prefs: StoragePrefs) => void;

export type StorageUpdateFn = (
  prev: StoragePrefs
) => StoragePrefs | DeepPartial<StoragePrefs>;

export type StorageUpdateArg = DeepPartial<StoragePrefs> | StorageUpdateFn;

function clampVolume(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(0, Math.min(1, val));
  }
  return fallback;
}

function clampMin(
  val: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.max(min, Math.min(max, Math.round(val)));
  }
  return fallback;
}

export class StorageManager {
  private key: string;
  private current: StoragePrefs;
  private initialized = false;
  private lastStoredRaw: string | null = null;
  private inMemoryDirty = false;
  private listeners = new Set<StorageListener>();

  constructor(key: string = STORAGE_KEY) {
    this.key = key;
    this.current = clonePrefs(DEFAULT_PREFERENCES);
  }

  private loadFromRaw(raw: string | null): StoragePrefs {
    if (raw === null || raw === undefined) {
      return clonePrefs(DEFAULT_PREFERENCES);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(
        `[StorageManager] Invalid JSON in storage for key "${this.key}"; falling back to defaults.`
      );
      return clonePrefs(DEFAULT_PREFERENCES);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `[StorageManager] Stored data for key "${this.key}" is not an object; falling back to defaults.`
      );
      return clonePrefs(DEFAULT_PREFERENCES);
    }

    const p = parsed as Record<string, unknown>;
    let hasWrongType = false;

    // 1. profile
    let name = DEFAULT_PREFERENCES.profile.name;
    const outfit: Outfit = { ...DEFAULT_PREFERENCES.profile.outfit };

    if (p.profile !== undefined) {
      if (
        typeof p.profile !== 'object' ||
        p.profile === null ||
        Array.isArray(p.profile)
      ) {
        hasWrongType = true;
      } else {
        const prof = p.profile as Record<string, unknown>;
        if (prof.name !== undefined) {
          if (typeof prof.name !== 'string') {
            hasWrongType = true;
          }
          name = sanitizeName(prof.name);
        }
        if (prof.outfit !== undefined) {
          if (
            typeof prof.outfit !== 'object' ||
            prof.outfit === null ||
            Array.isArray(prof.outfit)
          ) {
            hasWrongType = true;
          } else {
            const o = prof.outfit as Record<string, unknown>;
            if (o.baseId !== undefined) {
              if (typeof o.baseId === 'string') {
                outfit.baseId = o.baseId;
              } else {
                hasWrongType = true;
              }
            }
            if (o.hatId !== undefined) {
              if (typeof o.hatId === 'string') {
                outfit.hatId = o.hatId;
              } else {
                hasWrongType = true;
              }
            }
            if (o.colorHex !== undefined) {
              if (typeof o.colorHex === 'string') {
                outfit.colorHex = o.colorHex;
              } else {
                hasWrongType = true;
              }
            }
          }
        }
      }
    }

    // 2. unlockedLandmarks
    let unlockedLandmarks = [...DEFAULT_PREFERENCES.unlockedLandmarks];
    if (p.unlockedLandmarks !== undefined) {
      if (!Array.isArray(p.unlockedLandmarks)) {
        hasWrongType = true;
      } else {
        const validLandmarks: string[] = [];
        for (const item of p.unlockedLandmarks) {
          if (typeof item === 'string' && item.length > 0) {
            validLandmarks.push(item);
          } else {
            hasWrongType = true;
          }
        }
        if (validLandmarks.length > 0) {
          unlockedLandmarks = Array.from(new Set(validLandmarks));
        } else {
          unlockedLandmarks = [...DEFAULT_PREFERENCES.unlockedLandmarks];
        }
      }
    }

    // 3. volumes
    const volumes: VolumePrefs = { ...DEFAULT_PREFERENCES.volumes };
    if (p.volumes !== undefined) {
      if (
        typeof p.volumes !== 'object' ||
        p.volumes === null ||
        Array.isArray(p.volumes)
      ) {
        hasWrongType = true;
      } else {
        const v = p.volumes as Record<string, unknown>;
        const volKeys: (keyof VolumePrefs)[] = [
          'master',
          'music',
          'rain',
          'campfire',
          'ambience',
        ];
        for (const key of volKeys) {
          if (v[key] !== undefined) {
            if (typeof v[key] === 'number' && Number.isFinite(v[key])) {
              volumes[key] = Math.max(0, Math.min(1, v[key] as number));
            } else {
              hasWrongType = true;
            }
          }
        }
      }
    }

    // 4. pomo
    const pomo: PomoPrefs = { ...DEFAULT_PREFERENCES.pomo };
    if (p.pomo !== undefined) {
      if (
        typeof p.pomo !== 'object' ||
        p.pomo === null ||
        Array.isArray(p.pomo)
      ) {
        hasWrongType = true;
      } else {
        const po = p.pomo as Record<string, unknown>;
        if (po.preset !== undefined) {
          if (
            po.preset === '25/5' ||
            po.preset === '50/10' ||
            po.preset === 'custom'
          ) {
            pomo.preset = po.preset;
          } else {
            hasWrongType = true;
          }
        }
        if (po.focusMin !== undefined) {
          if (typeof po.focusMin === 'number' && Number.isFinite(po.focusMin)) {
            pomo.focusMin = Math.max(1, Math.min(120, Math.round(po.focusMin)));
          } else {
            hasWrongType = true;
          }
        }
        if (po.breakMin !== undefined) {
          if (typeof po.breakMin === 'number' && Number.isFinite(po.breakMin)) {
            pomo.breakMin = Math.max(1, Math.min(60, Math.round(po.breakMin)));
          } else {
            hasWrongType = true;
          }
        }
      }
    }

    // 5. zoom
    let zoom: ZoomLevel = DEFAULT_PREFERENCES.zoom;
    if (p.zoom !== undefined) {
      if (
        p.zoom === 'auto' ||
        p.zoom === 2 ||
        p.zoom === 3 ||
        p.zoom === 4
      ) {
        zoom = p.zoom;
      } else {
        hasWrongType = true;
      }
    }

    // 6. showNames
    let showNames: boolean = DEFAULT_PREFERENCES.showNames;
    if (p.showNames !== undefined) {
      if (typeof p.showNames === 'boolean') {
        showNames = p.showNames;
      } else {
        hasWrongType = true;
      }
    }

    if (hasWrongType) {
      console.warn(
        `[StorageManager] Invalid or wrong types in preferences for key "${this.key}"; falling back to defaults field by field.`
      );
    }

    // Unknown keys are dropped by explicitly constructing the returned object
    return {
      profile: {
        name,
        outfit,
      },
      unlockedLandmarks,
      volumes,
      pomo,
      zoom,
      showNames,
    };
  }

  private mergePrefs(
    current: StoragePrefs,
    patch: DeepPartial<StoragePrefs>
  ): StoragePrefs {
    const profilePatch = patch.profile;
    const outfitPatch = profilePatch?.outfit;
    const volumesPatch = patch.volumes;
    const pomoPatch = patch.pomo;

    const name =
      profilePatch?.name !== undefined
        ? sanitizeName(profilePatch.name)
        : current.profile.name;

    const outfit: Outfit = {
      baseId:
        outfitPatch?.baseId !== undefined
          ? String(outfitPatch.baseId)
          : current.profile.outfit.baseId,
      hatId:
        outfitPatch?.hatId !== undefined
          ? String(outfitPatch.hatId)
          : current.profile.outfit.hatId,
      colorHex:
        outfitPatch?.colorHex !== undefined
          ? String(outfitPatch.colorHex)
          : current.profile.outfit.colorHex,
    };

    let unlockedLandmarks = current.unlockedLandmarks;
    if (patch.unlockedLandmarks !== undefined) {
      if (Array.isArray(patch.unlockedLandmarks)) {
        const valid = patch.unlockedLandmarks.filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        );
        unlockedLandmarks =
          valid.length > 0
            ? Array.from(new Set(valid))
            : [...DEFAULT_PREFERENCES.unlockedLandmarks];
      }
    }

    const volumes: VolumePrefs = {
      master:
        volumesPatch?.master !== undefined
          ? clampVolume(volumesPatch.master, current.volumes.master)
          : current.volumes.master,
      music:
        volumesPatch?.music !== undefined
          ? clampVolume(volumesPatch.music, current.volumes.music)
          : current.volumes.music,
      rain:
        volumesPatch?.rain !== undefined
          ? clampVolume(volumesPatch.rain, current.volumes.rain)
          : current.volumes.rain,
      campfire:
        volumesPatch?.campfire !== undefined
          ? clampVolume(volumesPatch.campfire, current.volumes.campfire)
          : current.volumes.campfire,
      ambience:
        volumesPatch?.ambience !== undefined
          ? clampVolume(volumesPatch.ambience, current.volumes.ambience)
          : current.volumes.ambience,
    };

    const pomo: PomoPrefs = {
      preset:
        pomoPatch?.preset === '25/5' ||
        pomoPatch?.preset === '50/10' ||
        pomoPatch?.preset === 'custom'
          ? pomoPatch.preset
          : current.pomo.preset,
      focusMin:
        pomoPatch?.focusMin !== undefined
          ? clampMin(pomoPatch.focusMin, 1, 120, current.pomo.focusMin)
          : current.pomo.focusMin,
      breakMin:
        pomoPatch?.breakMin !== undefined
          ? clampMin(pomoPatch.breakMin, 1, 60, current.pomo.breakMin)
          : current.pomo.breakMin,
    };

    let zoom: ZoomLevel = current.zoom;
    if (
      patch.zoom === 'auto' ||
      patch.zoom === 2 ||
      patch.zoom === 3 ||
      patch.zoom === 4
    ) {
      zoom = patch.zoom;
    }

    const showNames =
      typeof patch.showNames === 'boolean'
        ? patch.showNames
        : current.showNames;

    return {
      profile: {
        name,
        outfit,
      },
      unlockedLandmarks,
      volumes,
      pomo,
      zoom,
      showNames,
    };
  }

  public get(): StoragePrefs {
    let raw: string | null = null;
    let readSuccess = false;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(this.key);
        readSuccess = true;
      }
    } catch {
      readSuccess = false;
    }

    if (!this.initialized) {
      this.current = this.loadFromRaw(raw);
      this.lastStoredRaw = raw;
      this.initialized = true;
      this.inMemoryDirty = false;
    } else if (readSuccess && raw !== this.lastStoredRaw) {
      this.current = this.loadFromRaw(raw);
      this.lastStoredRaw = raw;
      this.inMemoryDirty = false;
    }

    return this.current;
  }

  public update(updater: StorageUpdateArg): StoragePrefs {
    const current = this.get();
    const patch =
      typeof updater === 'function' ? updater(current) : updater;

    this.current = this.mergePrefs(current, patch);

    const json = JSON.stringify(this.current);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.key, json);
        this.lastStoredRaw = json;
        this.inMemoryDirty = false;
      }
    } catch {
      // If localStorage throws, work in memory without crashing
      this.inMemoryDirty = true;
    }

    for (const listener of Array.from(this.listeners)) {
      try {
        listener(this.current);
      } catch (err) {
        console.error('[StorageManager] Subscriber error:', err);
      }
    }

    return this.current;
  }

  public subscribe(cb: StorageListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public reset(): void {
    this.initialized = false;
    this.lastStoredRaw = null;
    this.inMemoryDirty = false;
    this.listeners.clear();
    this.current = clonePrefs(DEFAULT_PREFERENCES);
  }

  // Static proxy methods
  public static get(): StoragePrefs {
    return defaultStorageManager.get();
  }

  public static update(updater: StorageUpdateArg): StoragePrefs {
    return defaultStorageManager.update(updater);
  }

  public static subscribe(cb: StorageListener): () => void {
    return defaultStorageManager.subscribe(cb);
  }

  public static reset(): void {
    defaultStorageManager.reset();
  }
}

export const defaultStorageManager = new StorageManager();

export function get(): StoragePrefs {
  return defaultStorageManager.get();
}

export function update(updater: StorageUpdateArg): StoragePrefs {
  return defaultStorageManager.update(updater);
}

export function subscribe(cb: StorageListener): () => void {
  return defaultStorageManager.subscribe(cb);
}

export function resetStorageManager(): void {
  defaultStorageManager.reset();
}

export function usePrefs(manager: StorageManager = defaultStorageManager): StoragePrefs {
  return useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.get(),
    () => manager.get()
  );
}

export default defaultStorageManager;
