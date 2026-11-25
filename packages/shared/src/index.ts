export * from './types.js';
export * from './constants.js';
export * from './protocol.js';
export * from './spectator.js';
export * from './names.js';

export const PLACEHOLDER = 'lofi-forest';

export const EMOTE_IDS = [
  'heart',
  'coffee',
  'music',
  'wave',
  'zzz',
  'sparkle',
] as const;

export type EmoteId = (typeof EMOTE_IDS)[number];

export const HAT_IDS = ['none', 'beanie', 'cap', 'flower'] as const;

export type HatId = (typeof HAT_IDS)[number];

export const STATUS_BADGE_IDS = ['none', 'focus', 'break'] as const;

export type StatusBadgeId = (typeof STATUS_BADGE_IDS)[number];

export interface SpriteAssetEntry {
  src: string;
  author: string;
  license: string;
}

export interface HatAssetEntry extends SpriteAssetEntry {
  id: HatId;
}

export interface BgmAssetEntry {
  id: string;
  title: string;
  artist: string;
  src: string;
}

export interface AudioAssetEntry {
  src: string;
  title?: string;
  author?: string;
  license?: string;
}

export interface MapAssetEntry {
  src: string;
}

export interface AssetManifest {
  sprites: {
    tileset_forest: SpriteAssetEntry;
    char_base: SpriteAssetEntry;
    hats: HatAssetEntry[];
    emotes: Record<EmoteId, SpriteAssetEntry>;
  };
  audio: {
    bgm: BgmAssetEntry[];
    ambience: {
      rain: AudioAssetEntry;
      campfire: AudioAssetEntry;
      forest: AudioAssetEntry;
      pub: AudioAssetEntry;
    };
    sfx: {
      pomo_chime: AudioAssetEntry;
      teleport: AudioAssetEntry;
    };
  };
  maps?: {
    starter: MapAssetEntry;
    [key: string]: MapAssetEntry;
  };
}
