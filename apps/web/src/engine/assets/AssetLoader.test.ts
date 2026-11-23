import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Texture } from 'pixi.js';
import { AssetLoader } from './AssetLoader';
import {
  PLACEHOLDER_TEXTURES,
  getPlaceholderTexture,
  getHatPlaceholder,
  getEmotePlaceholder,
  getTilePlaceholder,
} from './placeholders';
import { EMOTE_IDS, HAT_IDS } from '@lofi/shared';
import type { AssetManifest } from '@lofi/shared';

describe('AssetLoader and Placeholders', () => {
  const manifestPath = resolve(__dirname, '../../../public/assets/manifest.json');
  let loader: AssetLoader;
  let warnSpy: any;
  let realManifest: AssetManifest;

  beforeEach(() => {
    loader = new AssetLoader();
    realManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (fetch mocked to 404): getTexture('tileset_forest') resolves to a placeholder texture, and console.warn fires exactly once even after two requests.
  it("getTexture('tileset_forest') resolves to a placeholder texture, and console.warn fires exactly once even after two requests (fetch mocked to 404)", async () => {
    loader.setManifest(realManifest);

    // Mock fetch to return 404
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    );

    // First call
    const texture1 = await loader.getTexture('tileset_forest');
    expect(texture1).toBeDefined();
    expect(texture1).toBe(PLACEHOLDER_TEXTURES.tileset_forest);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Second call
    const texture2 = await loader.getTexture('tileset_forest');
    expect(texture2).toBe(texture1);
    expect(texture2).toBe(PLACEHOLDER_TEXTURES.tileset_forest);
    // Warning must NOT fire a second time
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // Acceptance criterion:
  // Test (fetch mocked to 404): loadAudioBuffer(ctx, 'rain') resolves null without throwing.
  it("loadAudioBuffer(ctx, 'rain') resolves null without throwing (fetch mocked to 404)", async () => {
    loader.setManifest(realManifest);

    // Mock fetch to return 404
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)
    );

    const mockCtx = {
      decodeAudioData: vi.fn(),
    } as unknown as AudioContext;

    // Should resolve to null and not throw
    await expect(loader.loadAudioBuffer(mockCtx, 'rain')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Subsequent call should also resolve to null without additional warning
    await expect(loader.loadAudioBuffer(mockCtx, 'rain')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // Acceptance criterion:
  // Test: a placeholder exists for every EmoteId and every hat id in the manifest.
  it('a placeholder exists for every EmoteId and every hat id in the manifest', () => {
    const manifest: AssetManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    // Verify all hat ids in manifest have distinct placeholders
    const hatIds = manifest.sprites.hats.map((h) => h.id);
    expect(hatIds.length).toBeGreaterThan(0);
    expect(hatIds).toEqual(expect.arrayContaining([...HAT_IDS]));

    for (const hatId of hatIds) {
      const tex = getHatPlaceholder(hatId);
      expect(tex).toBeDefined();
      expect(tex).toBeInstanceOf(Texture);
      expect(tex!.width).toBe(16);
      expect(tex!.height).toBe(16);
    }
    // Each hat id in the manifest must resolve to its own distinct placeholder texture
    expect(new Set(hatIds.map((id) => getHatPlaceholder(id))).size).toBe(hatIds.length);

    // Unknown hat id returns undefined
    expect(getHatPlaceholder('unknown_hat')).toBeUndefined();

    // Verify all emote ids in manifest and EMOTE_IDS have distinct placeholders
    const emoteIds = Object.keys(manifest.sprites.emotes);
    expect(emoteIds).toHaveLength(6);
    expect(emoteIds).toEqual(expect.arrayContaining([...EMOTE_IDS]));

    for (const emoteId of emoteIds) {
      const tex = getEmotePlaceholder(emoteId);
      expect(tex).toBeDefined();
      expect(tex).toBeInstanceOf(Texture);
      expect(tex!.width).toBe(16);
      expect(tex!.height).toBe(16);
    }
    // Each emote id must resolve to its own distinct placeholder texture
    expect(new Set(emoteIds.map((id) => getEmotePlaceholder(id))).size).toBe(emoteIds.length);

    // Unknown emote id returns undefined
    expect(getEmotePlaceholder('unknown_emote')).toBeUndefined();
  });

  it('warns and returns placeholder or null without fetching when asset is not in manifest', async () => {
    loader.setManifest(realManifest);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const tex = await loader.getTexture('nonexistent_sprite');
    expect(tex).toBeDefined();
    expect(tex).toBe(PLACEHOLDER_TEXTURES.grass_0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const mockCtx = { decodeAudioData: vi.fn() } as unknown as AudioContext;
    const audio = await loader.loadAudioBuffer(mockCtx, 'nonexistent_audio');
    expect(audio).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('all required tile placeholders exist and have correct dimensions', () => {
    const tileKeys = [
      'grass_0',
      'grass_1',
      'dirt_path',
      'water_0',
      'water_1',
      'wooden_floor',
      'wall',
      'door',
      'tree_trunk',
      'tree_canopy',
      'log_seat',
      'stool',
      'bench',
      'campfire',
      'pier_planks',
      'rug',
      'flower',
    ];

    for (const key of tileKeys) {
      const tex = getPlaceholderTexture(key);
      expect(tex).toBeDefined();
      expect(tex).toBeInstanceOf(Texture);
      if (key === 'tree_canopy') {
        expect(tex.width).toBe(32);
        expect(tex.height).toBe(32);
      } else {
        expect(tex.width).toBe(16);
        expect(tex.height).toBe(16);
      }
    }

    // Character base
    const charBase = getPlaceholderTexture('char_base');
    expect(charBase).toBeDefined();
    expect(charBase.width).toBe(16);
    expect(charBase.height).toBe(16);

    // Status icons (book, coffee cup)
    const book = getPlaceholderTexture('book');
    expect(book).toBeDefined();
    expect(book.width).toBe(16);
    expect(book.height).toBe(16);

    const coffee = getPlaceholderTexture('coffee_cup');
    expect(coffee).toBeDefined();
    expect(coffee.width).toBe(16);
    expect(coffee.height).toBe(16);
  });
});
