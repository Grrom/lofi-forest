import {
  EMOTE_IDS,
  MAX_FRAME_BYTES,
  MAX_NAME_LEN,
  PUBLIC_ROOM_CODE,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from './constants.js';
import type {
  ClientMessage,
  EmoteId,
  Facing,
  Outfit,
  P2PEmoteMsg,
  P2PPlayerMsg,
  PlayerAction,
  PlayerNetState,
  PomoBadge,
  ServerMessage,
  ZoneId,
} from './types.js';

const VALID_ZONES = new Set<string>(['forest', 'lake', 'pub']);
const VALID_FACINGS = new Set<string>(['left', 'right', 'up', 'down']);
const VALID_ACTIONS = new Set<string>([
  'idle',
  'walk',
  'sit',
  'vibe',
  'sleep',
  'celebrate',
]);
const VALID_POMO = new Set<string>(['none', 'focus', 'break']);
const VALID_EMOTES = new Set<string>(EMOTE_IDS);

export function isZoneId(v: unknown): v is ZoneId {
  return typeof v === 'string' && VALID_ZONES.has(v);
}

export function isFacing(v: unknown): v is Facing {
  return typeof v === 'string' && VALID_FACINGS.has(v);
}

export function isPlayerAction(v: unknown): v is PlayerAction {
  return typeof v === 'string' && VALID_ACTIONS.has(v);
}

export function isPomoBadge(v: unknown): v is PomoBadge {
  return typeof v === 'string' && VALID_POMO.has(v);
}

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && VALID_EMOTES.has(v);
}

export function isValidOutfit(v: unknown): v is Outfit {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.baseId === 'string' &&
    typeof o.hatId === 'string' &&
    typeof o.colorHex === 'string'
  );
}

export function isValidPlayerNetState(v: unknown): v is PlayerNetState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  if (!isValidOutfit(p.outfit)) return false;
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.name === 'string' &&
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    isZoneId(p.zone) &&
    isFacing(p.facing) &&
    isPlayerAction(p.action) &&
    isPomoBadge(p.pomo)
  );
}

/**
 * Sanitize player name:
 * keep only ASCII letters, digits and spaces; collapse spaces; trim; cut to 16;
 * return 'Wanderer' if empty.
 */
export function sanitizeName(s: unknown): string {
  if (typeof s !== 'string') return 'Wanderer';
  const ascii = s.replace(/[^a-zA-Z0-9 ]/g, '');
  const collapsed = ascii.replace(/ +/g, ' ');
  const trimmed = collapsed.trim();
  const truncated = trimmed.slice(0, MAX_NAME_LEN);
  return truncated.length > 0 ? truncated : 'Wanderer';
}

/**
 * Clamp coordinates to world boundaries [0, WORLD_WIDTH_PX] and [0, WORLD_HEIGHT_PX].
 */
export function clampToWorld(
  x: number,
  y: number
): { x: number; y: number } & [number, number] {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const clampedX = Math.max(0, Math.min(safeX, WORLD_WIDTH_PX));
  const clampedY = Math.max(0, Math.min(safeY, WORLD_HEIGHT_PX));

  const result = {
    x: clampedX,
    y: clampedY,
  } as { x: number; y: number } & [number, number];

  Object.defineProperty(result, 0, {
    enumerable: false,
    value: clampedX,
  });
  Object.defineProperty(result, 1, {
    enumerable: false,
    value: clampedY,
  });
  Object.defineProperty(result, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      yield clampedX;
      yield clampedY;
    },
  });

  return result;
}

/**
 * Validate room code: /^[a-z0-9-]{3,32}$/ and not equal to PUBLIC_ROOM_CODE.
 */
export function isValidRoomCode(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  if (s === PUBLIC_ROOM_CODE) return false;
  return /^[a-z0-9-]{3,32}$/.test(s);
}

const textEncoder = new TextEncoder();

/**
 * Parse client -> server message. Returns typed ClientMessage or null. Never throws.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  if (textEncoder.encode(raw).length > MAX_FRAME_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const msg = parsed as Record<string, unknown>;

  switch (msg.t) {
    case 'hello': {
      if (typeof msg.name !== 'string' || msg.name.length > 64) {
        return null;
      }
      if (!isValidOutfit(msg.outfit)) {
        return null;
      }
      return {
        t: 'hello',
        name: sanitizeName(msg.name),
        outfit: {
          baseId: msg.outfit.baseId,
          hatId: msg.outfit.hatId,
          colorHex: msg.outfit.colorHex,
        },
      };
    }
    case 'state': {
      if (typeof msg.x !== 'number' || !Number.isFinite(msg.x)) return null;
      if (typeof msg.y !== 'number' || !Number.isFinite(msg.y)) return null;
      if (!isZoneId(msg.zone)) return null;
      if (!isFacing(msg.facing)) return null;
      if (!isPlayerAction(msg.action)) return null;
      if (!isPomoBadge(msg.pomo)) return null;
      return {
        t: 'state',
        x: msg.x,
        y: msg.y,
        zone: msg.zone,
        facing: msg.facing,
        action: msg.action,
        pomo: msg.pomo,
      };
    }
    case 'emote': {
      if (!isEmoteId(msg.e)) return null;
      return {
        t: 'emote',
        e: msg.e,
      };
    }
    default:
      return null;
  }
}

/**
 * Parse server -> client message. Returns typed ServerMessage or null. Never throws.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const msg = parsed as Record<string, unknown>;

  switch (msg.t) {
    case 'welcome': {
      if (typeof msg.id !== 'string' || msg.id.length === 0) return null;
      if (!Array.isArray(msg.players)) return null;
      for (const p of msg.players) {
        if (!isValidPlayerNetState(p)) return null;
      }
      return {
        t: 'welcome',
        id: msg.id,
        players: msg.players as PlayerNetState[],
      };
    }
    case 'snap': {
      if (!Array.isArray(msg.players) || !Array.isArray(msg.left)) return null;
      for (const p of msg.players) {
        if (!isValidPlayerNetState(p)) return null;
      }
      for (const leftId of msg.left) {
        if (typeof leftId !== 'string') return null;
      }
      return {
        t: 'snap',
        players: msg.players as PlayerNetState[],
        left: msg.left as string[],
      };
    }
    case 'emote': {
      if (typeof msg.id !== 'string' || msg.id.length === 0) return null;
      if (!isEmoteId(msg.e)) return null;
      return {
        t: 'emote',
        id: msg.id,
        e: msg.e,
      };
    }
    case 'full': {
      return { t: 'full' };
    }
    default:
      return null;
  }
}

/**
 * Validate P2P player state message. Returns typed P2PPlayerMsg or null. Never throws.
 */
export function validateP2PPlayer(v: unknown): P2PPlayerMsg | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }

  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return null;
  }

  const p = v as Record<string, unknown>;
  if (
    typeof p.name !== 'string' ||
    p.name.length > 64 ||
    typeof p.x !== 'number' ||
    !Number.isFinite(p.x) ||
    typeof p.y !== 'number' ||
    !Number.isFinite(p.y) ||
    !isZoneId(p.zone) ||
    !isFacing(p.facing) ||
    !isPlayerAction(p.action) ||
    !isValidOutfit(p.outfit) ||
    !isPomoBadge(p.pomo)
  ) {
    return null;
  }

  return {
    name: sanitizeName(p.name),
    x: p.x,
    y: p.y,
    zone: p.zone,
    facing: p.facing,
    action: p.action,
    outfit: {
      baseId: p.outfit.baseId,
      hatId: p.outfit.hatId,
      colorHex: p.outfit.colorHex,
    },
    pomo: p.pomo,
  };
}

/**
 * Validate P2P emote message. Returns typed P2PEmoteMsg or null. Never throws.
 */
export function validateEmote(v: unknown): P2PEmoteMsg | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object') {
        v = parsed;
      }
    } catch {
      // not JSON
    }
  }

  if (typeof v === 'object' && v !== null && 'e' in v) {
    const e = (v as { e: unknown }).e;
    if (isEmoteId(e)) {
      return { e };
    }
  }

  if (typeof v === 'string' && isEmoteId(v)) {
    return { e: v };
  }

  return null;
}
