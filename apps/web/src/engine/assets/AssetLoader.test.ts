import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Texture } from 'pixi.js';
import { AssetLoader, getTexture, loadAudioBuffer } from './AssetLoader';
import {
  PLACEHOLDER_TEXTURES,
  getPlaceholderTexture,
  getHatPlaceholder,
  getEmotePlaceholder,
  getTilePlaceholder,
} from './placeholders';
import { EMOTE_IDS, HAT_IDS } from '@lofi/shared';

describe('AssetLoader and Placeholders', () => {
  let loader: AssetLoader;
  let warnSpy: any;

  beforeEach(() => {
    loader = new AssetLoader();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (fetch mocked to 404): getTexture('tileset_forest') resolves to a placeholder texture, and console.warn fires exactly once even after two requests.
  it("getTexture('tileset_forest') resolves to a placeholder texture, and console.warn fires exactly once even after two requests (fetch mocked to 404)", async () => {
    // Mock fetch to return 404
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    // First call
    const texture1 = await loader.getTexture('tileset_forest');
    expect(texture1).toBeDefined();
    expect(texture1).toBeInstanceOf(Texture);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Second call
    const texture2 = await loader.getTexture('tileset_forest');
    expect(texture2).toBe(texture1);
    // Warning must NOT fire a second time
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  // Acceptance criterion:
  // Test (fetch mocked to 404): loadAudioBuffer(ctx, 'rain') resolves null without throwing.
  it("loadAudioBuffer(ctx, 'rain') resolves null without throwing (fetch mocked to 404)", async () => {
    // Mock fetch to return 404
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

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
    // Check all 6 EmoteIds
    expect(EMOTE_IDS).toHaveLength(6);
    for (const emoteId of EMOTE_IDS) {
      const tex = getEmotePlaceholder(emoteId);
      expect(tex).toBeDefined();
      expect(tex).toBeInstanceOf(Texture);
      expect(tex.width).toBe(16);
      expect(tex.height).toBe(16);
    }

    // Check all hat IDs (none, beanie, cap, flower)
    expect(HAT_IDS).toHaveLength(4);
    for (const hatId of HAT_IDS) {
      const tex = getHatPlaceholder(hatId);
      expect(tex).toBeDefined();
      expect(tex).toBeInstanceOf(Texture);
      expect(tex.width).toBe(16);
      expect(tex.height).toBe(16);
    }
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
