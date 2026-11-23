import type { EmoteId } from './types.js';

export const TILE_SIZE = 16;
export const MAP_WIDTH_TILES = 128;
export const MAP_HEIGHT_TILES = 64;
export const WORLD_WIDTH_PX = MAP_WIDTH_TILES * TILE_SIZE;
export const WORLD_HEIGHT_PX = MAP_HEIGHT_TILES * TILE_SIZE;

export const PLAYER_SPEED_PX_S = 80;

export const NET_SEND_HZ = 10;
export const NET_HEARTBEAT_MS = 2000;

export const MAX_NAME_LEN = 16;
export const MAX_FRAME_BYTES = 512;

export const P2P_MAX_PEERS = 10;

export const EMOTE_HOLD_MS = 3500;
export const AFK_MS = 300000;

export const TELEPORT_SNAP_PX = 128;
export const INTERP_DELAY_MS = 140;

export const EMOTE_IDS: readonly EmoteId[] = [
  'heart',
  'coffee',
  'music',
  'wave',
  'zzz',
  'sparkle',
] as const;

export const PUBLIC_ROOM_CODE = 'public';
