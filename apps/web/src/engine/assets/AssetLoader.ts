import { Assets, Texture } from 'pixi.js';
import type { AssetManifest, EmoteId, HatId } from '@lofi/shared';
import {
  getEmotePlaceholder,
  getHatPlaceholder,
  getPlaceholderTexture,
  getTilePlaceholder,
} from './placeholders';

export const DEFAULT_MANIFEST: AssetManifest = {
  sprites: {
    tileset_forest: {
      src: '/assets/sprites/tileset_forest.png',
      author: 'Human Artist',
      license: 'CC-BY-4.0',
    },
    char_base: {
      src: '/assets/sprites/char_base.png',
      author: 'Human Artist',
      license: 'CC-BY-4.0',
    },
    hats: [
      {
        id: 'none',
        src: '/assets/sprites/hats/none.png',
        author: 'Human Artist',
        license: 'CC0',
      },
      {
        id: 'beanie',
        src: '/assets/sprites/hats/beanie.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      {
        id: 'cap',
        src: '/assets/sprites/hats/cap.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      {
        id: 'flower',
        src: '/assets/sprites/hats/flower.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
    ],
    emotes: {
      wave: {
        src: '/assets/sprites/emotes/wave.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      heart: {
        src: '/assets/sprites/emotes/heart.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      smile: {
        src: '/assets/sprites/emotes/smile.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      sparkle: {
        src: '/assets/sprites/emotes/sparkle.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      music: {
        src: '/assets/sprites/emotes/music.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
      zzz: {
        src: '/assets/sprites/emotes/zzz.png',
        author: 'Human Artist',
        license: 'CC-BY-4.0',
      },
    },
  },
  audio: {
    bgm: [
      {
        id: 'forest_lullaby',
        title: 'Forest Lullaby',
        artist: 'Human Composer',
        src: '/assets/audio/bgm/forest_lullaby.ogg',
      },
    ],
    ambience: {
      rain: { src: '/assets/audio/ambience/rain.ogg' },
      campfire: { src: '/assets/audio/ambience/campfire.ogg' },
      forest: { src: '/assets/audio/ambience/forest.ogg' },
      pub: { src: '/assets/audio/ambience/pub.ogg' },
    },
    sfx: {
      pomo_chime: { src: '/assets/audio/sfx/pomo_chime.ogg' },
      teleport: { src: '/assets/audio/sfx/teleport.ogg' },
    },
  },
};

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

  public setManifest(manifest: AssetManifest): void {
    this.manifest = manifest;
  }

  public getManifest(): AssetManifest | null {
    return this.manifest;
  }

  public async loadManifest(url = '/assets/manifest.json'): Promise<AssetManifest> {
    if (this.manifest) return this.manifest;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.warnOnce(
          'manifest',
          `[AssetLoader] Failed to fetch manifest from "${url}" (HTTP ${res.status}).`
        );
        this.manifest = DEFAULT_MANIFEST;
        return DEFAULT_MANIFEST;
      }
      const data = (await res.json()) as AssetManifest;
      this.manifest = data;
      return data;
    } catch (err) {
      this.warnOnce(
        'manifest',
        `[AssetLoader] Error reading manifest from "${url}": ${err}`
      );
      this.manifest = DEFAULT_MANIFEST;
      return DEFAULT_MANIFEST;
    }
  }

  public async getTexture(key: string): Promise<Texture> {
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key)!;
    }

    let src = '';
    if (this.manifest) {
      if (key === 'tileset_forest') {
        src = this.manifest.sprites.tileset_forest?.src;
      } else if (key === 'char_base') {
        src = this.manifest.sprites.char_base?.src;
      } else if (this.manifest.sprites.emotes?.[key as EmoteId]) {
        src = this.manifest.sprites.emotes[key as EmoteId].src;
      } else {
        const hatMatch = this.manifest.sprites.hats?.find((h) => h.id === key);
        if (hatMatch) src = hatMatch.src;
      }
    }

    if (!src) {
      src = `/assets/sprites/${key}.png`;
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

      // If fetch succeeds, attempt to load via Pixi Assets
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

  public async getHatTexture(id: HatId | string): Promise<Texture> {
    const cacheKey = `hat_${id}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    if (id === 'none') {
      const placeholder = getHatPlaceholder('none');
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    }

    const hatEntry = this.manifest?.sprites?.hats?.find((h) => h.id === id);
    const src = hatEntry?.src || `/assets/sprites/hats/${id}.png`;

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Hat asset "${id}" at "${src}" returned HTTP ${res.status}. Falling back to procedural placeholder.`
        );
        const placeholder = getHatPlaceholder(id);
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

      const placeholder = getHatPlaceholder(id);
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    } catch (fetchErr) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Failed to fetch hat "${id}" from "${src}": ${fetchErr}. Falling back to placeholder.`
      );
      const placeholder = getHatPlaceholder(id);
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
    const src = emoteEntry?.src || `/assets/sprites/emotes/${id}.png`;

    try {
      const res = await fetch(src);
      if (!res.ok) {
        this.warnOnce(
          cacheKey,
          `[AssetLoader] Emote asset "${id}" at "${src}" returned HTTP ${res.status}. Falling back to procedural placeholder.`
        );
        const placeholder = getEmotePlaceholder(id);
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

      const placeholder = getEmotePlaceholder(id);
      this.textureCache.set(cacheKey, placeholder);
      return placeholder;
    } catch (fetchErr) {
      this.warnOnce(
        cacheKey,
        `[AssetLoader] Failed to fetch emote "${id}" from "${src}": ${fetchErr}. Falling back to placeholder.`
      );
      const placeholder = getEmotePlaceholder(id);
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
      src = `/assets/audio/${key}.ogg`;
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
  public getTextureSync(key: string): Texture {
    return this.textureCache.get(key) || getPlaceholderTexture(key);
  }

  public getHatTextureSync(id: HatId | string): Texture {
    return this.textureCache.get(`hat_${id}`) || getHatPlaceholder(id);
  }

  public getEmoteTextureSync(id: EmoteId | string): Texture {
    return this.textureCache.get(`emote_${id}`) || getEmotePlaceholder(id);
  }

  public getTileTextureSync(tileId: string | number): Texture {
    return this.textureCache.get(`tile_${tileId}`) || getTilePlaceholder(tileId);
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
