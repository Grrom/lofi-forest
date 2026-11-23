import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  StorageManager,
  STORAGE_KEY,
  get,
  update,
  subscribe,
  resetStorageManager,
  usePrefs,
} from './StorageManager';

const DOCUMENTED_DEFAULTS = {
  profile: {
    name: 'Wanderer',
    outfit: {
      baseId: 'default',
      hatId: 'none',
      colorHex: '#ffffff',
    },
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
    preset: '25/5' as const,
    focusMin: 25,
    breakMin: 5,
  },
  zoom: 'auto' as const,
  showNames: true,
};

describe('StorageManager', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorageManager();
    vi.restoreAllMocks();
  });

  // Acceptance Criterion 1
  it('with empty storage, get() returns the documented defaults', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prefs = get();
    expect(prefs).toEqual({
      profile: {
        name: 'Wanderer',
        outfit: {
          baseId: 'default',
          hatId: 'none',
          colorHex: '#ffffff',
        },
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
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Acceptance Criterion 2
  it("with stored value '{not json', get() returns defaults and console.warn was called once", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{not json');

    const prefs = get();
    expect(prefs).toEqual(DOCUMENTED_DEFAULTS);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('Invalid JSON');
  });

  // Acceptance Criterion 3
  it('stored volumes.master = 7 loads as 1; focusMin = 0 loads as 1', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volumes: {
          master: 7,
        },
        pomo: {
          focusMin: 0,
        },
      })
    );

    const prefs = get();
    expect(prefs.volumes.master).toBe(1);
    expect(prefs.pomo.focusMin).toBe(1);
    // Other fields fall back to defaults
    expect(prefs.volumes.music).toBe(DOCUMENTED_DEFAULTS.volumes.music);
    expect(prefs.pomo.preset).toBe(DOCUMENTED_DEFAULTS.pomo.preset);
    expect(prefs.pomo.breakMin).toBe(DOCUMENTED_DEFAULTS.pomo.breakMin);
  });

  // Acceptance Criterion 4
  it('update({ zoom: 3 }) writes to localStorage immediately and calls subscribers once', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribe(subscriber);

    expect(subscriber).not.toHaveBeenCalled();

    update({ zoom: 3 });

    // Check localStorage was written immediately
    const storedRaw = localStorage.getItem(STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);
    expect(stored.zoom).toBe(3);

    // Check subscriber was called once
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 3 })
    );

    unsubscribe();
  });

  // Acceptance Criterion 5
  it('when localStorage.setItem throws, update still updates the in-memory state and does not throw', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    const subscriber = vi.fn();
    const unsubscribe = subscribe(subscriber);

    expect(() => {
      update({ zoom: 4 });
    }).not.toThrow();

    expect(setItemSpy).toHaveBeenCalled();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: 4 })
    );
    expect(get().zoom).toBe(4);

    unsubscribe();
  });

  describe('Additional behaviors', () => {
    it('supports functional updates with update(fn)', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribe(subscriber);

      update((prev) => ({
        ...prev,
        showNames: false,
      }));

      expect(get().showNames).toBe(false);
      expect(subscriber).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('performs deep partial merges on nested objects without overwriting siblings', () => {
      update({
        volumes: {
          rain: 0.1,
        },
      });

      const prefs = get();
      expect(prefs.volumes.rain).toBe(0.1);
      expect(prefs.volumes.master).toBe(DOCUMENTED_DEFAULTS.volumes.master);
      expect(prefs.volumes.music).toBe(DOCUMENTED_DEFAULTS.volumes.music);
      expect(prefs.volumes.campfire).toBe(DOCUMENTED_DEFAULTS.volumes.campfire);
      expect(prefs.volumes.ambience).toBe(DOCUMENTED_DEFAULTS.volumes.ambience);
    });

    it('drops unknown keys on load and sanitizes profile name', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          unknownField: 'malicious',
          profile: {
            name: '  Hero 123!  ',
            outfit: {
              baseId: 'base1',
              hatId: 'hat1',
              colorHex: '#123456',
              extraOutfit: true,
            },
            unknownProfileProp: 42,
          },
        })
      );

      const prefs = get();
      expect(prefs.profile.name).toBe('Hero 123');
      expect(prefs.profile.outfit).toEqual({
        baseId: 'base1',
        hatId: 'hat1',
        colorHex: '#123456',
      });
      expect((prefs as unknown as Record<string, unknown>).unknownField).toBeUndefined();
      expect(
        (prefs.profile as unknown as Record<string, unknown>).unknownProfileProp
      ).toBeUndefined();
      expect(
        (prefs.profile.outfit as unknown as Record<string, unknown>).extraOutfit
      ).toBeUndefined();
    });

    it('falls back to defaults and warns when stored data contains wrong types', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          zoom: 'invalid-zoom',
          volumes: {
            master: 'loud',
          },
        })
      );

      const prefs = get();
      expect(prefs.zoom).toBe('auto');
      expect(prefs.volumes.master).toBe(0.8);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('warns when stored data is not an object (e.g. array or primitive)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

      const prefs = get();
      expect(prefs).toEqual(DOCUMENTED_DEFAULTS);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe removes the listener so it is not called again', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribe(subscriber);

      update({ zoom: 2 });
      expect(subscriber).toHaveBeenCalledTimes(1);

      unsubscribe();
      update({ zoom: 3 });
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('usePrefs hook provides current preferences and re-renders when preferences change', () => {
      const { result } = renderHook(() => usePrefs());

      expect(result.current.zoom).toBe('auto');

      act(() => {
        update({ zoom: 3 });
      });

      expect(result.current.zoom).toBe(3);
    });

    it('allows isolated StorageManager instances with custom keys', () => {
      const customManager = new StorageManager('custom-key');
      expect(customManager.get()).toEqual(DOCUMENTED_DEFAULTS);

      customManager.update({ zoom: 4 });
      expect(customManager.get().zoom).toBe(4);
      expect(get().zoom).toBe('auto');

      const customRaw = localStorage.getItem('custom-key');
      expect(customRaw).not.toBeNull();
      expect(JSON.parse(customRaw!).zoom).toBe(4);
    });

    it('returns a deeply frozen preferences object from get() to prevent accidental mutation', () => {
      const prefs = get();
      expect(Object.isFrozen(prefs)).toBe(true);
      expect(Object.isFrozen(prefs.profile)).toBe(true);
      expect(Object.isFrozen(prefs.profile.outfit)).toBe(true);
      expect(Object.isFrozen(prefs.unlockedLandmarks)).toBe(true);
      expect(Object.isFrozen(prefs.volumes)).toBe(true);
      expect(Object.isFrozen(prefs.pomo)).toBe(true);

      expect(() => {
        (prefs.volumes as unknown as { master: number }).master = 0.2;
      }).toThrow();
    });
  });
});
