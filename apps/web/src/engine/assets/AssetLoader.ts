import { Assets, Texture } from 'pixi.js';
import type { AssetManifest, EmoteId, HatId } from '@lofi/shared';
import {
  getEmotePlaceholder,
  getHatPlaceholder,
  getPlaceholderTexture,
  getTilePlaceholder,
} from './placeholders';

export class AssetLoader {
  private manifest: AssetManifest | null = null;
  private textureCache = new Map<string, Texture>();
  private audioCache = new Map<string, AudioBuffer>();
  private failedAudioKeys = new Set<string>();
  private warnedKeys = new Set<string>();

  public warnOnce(key: string, message: string): void {
    if (!this.warnedKeys.has(key)) {
      this.warnedKeys.add(key);
      console.warn(message);
    }
  }

  public clearCache(): void {
    this.textureCache.clear();
    this.audioCache.clear();
    this.failedAudioKeys.clear();
    this.warnedKeys.clear();
    this.manifest = null;
  }

  public setManifest(manifest: AssetManifest | null): void {
    this.manifest = manifest;
  }

  public getManifest(): AssetManifest | null {
    return this.manifest;
  }

  public async loadManifest(url = '/assets/manifest.json'): Promise<AssetManifest | null> {
    if (this.manifest) return this.manifest;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.warnOnce(
          'manifest',
          `[AssetLoader] Failed to fetch manifest from "${url}" (HTTP ${res.status}).`
        );
        this.manifest = null;
        return null;
      }
      const data = (await res.json()) as AssetManifest;
      this.manifest = data;
      return data;
    } catch (err) {
      this.warnOnce(
        'manifest',
        `[AssetLoader] Error reading manifest from "${url}": ${err}`
      );
      this.manifest = null;
      return null;
    }
  }

  public async getHatTexture(id: HatId | string): Promise<Texture> {
    const cacheKey = `hat_${id}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    const hatEntry = this.manifest?.sprites?.hats?.find((h) => h.id === id);
    const src = hatEntry?.src;

    if (!src) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Hat asset "${id}" not found in manifest. Falling back to procedural placeholder.`
      );
      const placeholder = getHatPlaceholder(id) ?? getPlaceholderTexture('none');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    }

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Hat asset "${id}" at "${src}" returned HTTP ${res.status}. Falling back to procedural placeholder.`
        );
        const placeholder = getHatPlaceholder(id) ?? getPlaceholderTexture('none');
        this.textureCache.set(cacheKey, placeholder);
        return placeholder;
      }

      try {
        const loadedTexture = await Assets.load<Texture>(src);
        if (loadedTexture) {
          this.textureCache.set(cacheKey, loadedTexture);
          return loadedTexture;
        }
      } catch (decodeErr) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Failed to decode hat "${id}" from "${src}": ${decodeErr}. Falling back to placeholder.`
        );
      }

      const placeholder = getHatPlaceholder(id) ?? getPlaceholderTexture('none');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    } catch (fetchErr) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Failed to fetch hat "${id}" from "${src}": ${fetchErr}. Falling back to placeholder.`
      );
      const placeholder = getHatPlaceholder(id) ?? getPlaceholderTexture('none');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    }
  }

  public async getEmoteTexture(id: EmoteId | string): Promise<Texture> {
    const cacheKey = `emote_${id}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    const emoteEntry = this.manifest?.sprites?.emotes?.[id as EmoteId];
    const src = emoteEntry?.src;

    if (!src) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Emote asset "${id}" not found in manifest. Falling back to procedural placeholder.`
      );
      const placeholder = getEmotePlaceholder(id) ?? getPlaceholderTexture('smile');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    }

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Emote asset "${id}" at "${src}" returned HTTP ${res.status}. Falling back to procedural placeholder.`
        );
        const placeholder = getEmotePlaceholder(id) ?? getPlaceholderTexture('smile');
        this.textureCache.set(cacheKey, placeholder);
        return placeholder;
      }

      try {
        const loadedTexture = await Assets.load<Texture>(src);
        if (loadedTexture) {
          this.textureCache.set(cacheKey, loadedTexture);
          return loadedTexture;
        }
      } catch (decodeErr) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Failed to decode emote "${id}" from "${src}": ${decodeErr}. Falling back to placeholder.`
        );
      }

      const placeholder = getEmotePlaceholder(id) ?? getPlaceholderTexture('smile');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    } catch (fetchErr) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Failed to fetch emote "${id}" from "${src}": ${fetchErr}. Falling back to placeholder.`
      );
      const placeholder = getEmotePlaceholder(id) ?? getPlaceholderTexture('smile');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    }
  }

  public async getTileTexture(tileId: string | number): Promise<Texture> {
    const cacheKey = `tile_${tileId}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }
    const placeholder = getTilePlaceholder(tileId);
    this.textureCache.set(cacheKey, placeholder);
    return placeholder;
  }

  public async getTexture(key: string): Promise<Texture> {
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!;
    }

    // Route hats
    if (key.startsWith('hat_')) {
      const tex = await this.getHatTexture(key.slice(4));
      this.textureCache.set(key, tex);
      return tex;
    }
    if (this.manifest?.sprites?.hats?.some((h) => h.id === key)) {
      const tex = await this.getHatTexture(key);
      this.textureCache.set(key, tex);
      return tex;
    }

    // Route emotes
    if (key.startsWith('emote_')) {
      const tex = await this.getEmoteTexture(key.slice(6));
      this.textureCache.set(key, tex);
      return tex;
    }
    if (this.manifest?.sprites?.emotes?.[key as EmoteId]) {
      const tex = await this.getEmoteTexture(key);
      this.textureCache.set(key, tex);
      return tex;
    }

    // Route tiles
    if (key.startsWith('tile_')) {
      const tex = await this.getTileTexture(key.slice(5));
      this.textureCache.set(key, tex);
      return tex;
    }

    let src = '';
    if (this.manifest) {
      if (key === 'tileset_forest') {
        src = this.manifest.sprites.tileset_forest?.src;
      } else if (key === 'char_base') {
        src = this.manifest.sprites.char_base?.src;
      } else if ((this.manifest.sprites as any)[key]?.src) {
        src = (this.manifest.sprites as any)[key].src;
      }
    }

    if (!src) {
      this.warnOnce(
        key,
        `[AssetLoader] Texture asset "${key}" not found in manifest. Falling back to procedural placeholder.`
      );
      const placeholder = getPlaceholderTexture(key);
      this.textureCache.set(key, placeholder);
      return placeholder;
    }

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          key,
          `[AssetLoader] Texture asset "${key}" at "${src}" returned HTTP ${res.status}. Falling back to procedural placeholder.`
        );
        const placeholder = getPlaceholderTexture(key);
        this.textureCache.set(key, placeholder);
        return placeholder;
      }

      try {
        const loadedTexture = await Assets.load<Texture>(src);
        if (loadedTexture) {
          this.textureCache.set(key, loadedTexture);
          return loadedTexture;
        }
      } catch (decodeErr) {
        this.warnOnce(
          key,
          `[AssetLoader] Failed to decode texture "${key}" from "${src}": ${decodeErr}. Falling back to placeholder.`
        );
      }

      const placeholder = getPlaceholderTexture(key);
      this.textureCache.set(key, placeholder);
      return placeholder;
    } catch (fetchErr) {
      this.warnOnce(
        key,
        `[AssetLoader] Failed to fetch texture "${key}" from "${src}": ${fetchErr}. Falling back to placeholder.`
      );
      const placeholder = getPlaceholderTexture(key);
      this.textureCache.set(key, placeholder);
      return placeholder;
    }
  }

  public async loadAudioBuffer(
    ctx: AudioContext,
    key: string
  ): Promise<AudioBuffer | null> {
    if (this.audioCache.has(key)) {
      return this.audioCache.get(key)!;
    }
    if (this.failedAudioKeys.has(key)) {
      return null;
    }

    let src = '';
    if (this.manifest) {
      const ambience = this.manifest.audio?.ambience as
        | Record<string, { src: string }>
        | undefined;
      const sfx = this.manifest.audio?.sfx as
        | Record<string, { src: string }>
        | undefined;
      const bgm = this.manifest.audio?.bgm;

      if (ambience && ambience[key]?.src) {
        src = ambience[key].src;
      } else if (sfx && sfx[key]?.src) {
        src = sfx[key].src;
      } else if (bgm) {
        const match = bgm.find((b) => b.id === key);
        if (match?.src) src = match.src;
      }
    }

    if (!src) {
      this.warnOnce(
        key,
        `[AssetLoader] Audio asset "${key}" not found in manifest. Falling back to null (synthesize).`
      );
      this.failedAudioKeys.add(key);
      return null;
    }

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          key,
          `[AssetLoader] Audio asset "${key}" at "${src}" returned HTTP ${res.status}. Falling back to null (synthesize).`
        );
        this.failedAudioKeys.add(key);
        return null;
      }
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.audioCache.set(key, audioBuffer);
      return audioBuffer;
    } catch (err) {
      this.warnOnce(
        key,
        `[AssetLoader] Failed to load or decode audio "${key}" at "${src}": ${err}. Falling back to null (synthesize).`
      );
      this.failedAudioKeys.add(key);
      return null;
    }
  }

  // Synchronous convenience getters
  public getHatTextureSync(id: HatId | string): Texture {
    const cacheKey = `hat_${id}`;
    return this.textureCache.get(cacheKey) || getHatPlaceholder(id) || getPlaceholderTexture('none');
  }

  public getEmoteTextureSync(id: EmoteId | string): Texture {
    const cacheKey = `emote_${id}`;
    return this.textureCache.get(cacheKey) || getEmotePlaceholder(id) || getPlaceholderTexture('smile');
  }

  public getTileTextureSync(tileId: string | number): Texture {
    return this.textureCache.get(`tile_${tileId}`) || getTilePlaceholder(tileId);
  }

  public getTextureSync(key: string): Texture {
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!;
    }
    if (key.startsWith('hat_')) {
      return this.getHatTextureSync(key.slice(4));
    }
    if (this.manifest?.sprites?.hats?.some((h) => h.id === key)) {
      return this.getHatTextureSync(key);
    }
    if (key.startsWith('emote_')) {
      return this.getEmoteTextureSync(key.slice(6));
    }
    if (this.manifest?.sprites?.emotes?.[key as EmoteId]) {
      return this.getEmoteTextureSync(key);
    }
    if (key.startsWith('tile_')) {
      return this.getTileTextureSync(key.slice(5));
    }
    return getPlaceholderTexture(key);
  }
}

export const assetLoader = new AssetLoader();

export const loadManifest = (url?: string) => assetLoader.loadManifest(url);
export const getTexture = (key: string) => assetLoader.getTexture(key);
export const getHatTexture = (id: HatId | string) => assetLoader.getHatTexture(id);
export const getEmoteTexture = (id: EmoteId | string) =>
  assetLoader.getEmoteTexture(id);
export const getTileTexture = (tileId: string | number) =>
  assetLoader.getTileTexture(tileId);
export const loadAudioBuffer = (ctx: AudioContext, key: string) =>
  assetLoader.loadAudioBuffer(ctx, key);
