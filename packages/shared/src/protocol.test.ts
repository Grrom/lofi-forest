import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AFK_MS,
  clampToWorld,
  EMOTE_HOLD_MS,
  EMOTE_IDS,
  INTERP_DELAY_MS,
  isValidRoomCode,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MAX_FRAME_BYTES,
  MAX_NAME_LEN,
  NET_HEARTBEAT_MS,
  NET_SEND_HZ,
  P2P_MAX_PEERS,
  parseClientMessage,
  parseServerMessage,
  PLAYER_SPEED_PX_S,
  PUBLIC_ROOM_CODE,
  sanitizeName,
  TELEPORT_SNAP_PX,
  TILE_SIZE,
  validateEmote,
  validateP2PPlayer,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from './index.js';

describe('Issue #2 Acceptance Criteria', () => {
  // Acceptance criterion:
  // Tests: `parseClientMessage` returns null for each of these inputs:
  // - a string over 512 UTF-8 bytes
  // - invalid JSON
  // - unknown `t`
  // - an invalid enum value (zone, facing, action, pomo, emote)
  // - `NaN`, `Infinity` or a non-number coordinate
  // - a raw name over 64 chars
  // - missing fields
  describe('parseClientMessage returns null for invalid inputs', () => {
    it('returns null for a string over 512 UTF-8 bytes', () => {
      // Create a payload that exceeds 512 UTF-8 bytes
      const longPadding = 'a'.repeat(513);
      expect(parseClientMessage(longPadding)).toBeNull();

      // Multibyte characters exceeding 512 bytes
      const multiBytePayload = JSON.stringify({
        t: 'hello',
        name: 'test',
        outfit: { baseId: 'b', hatId: 'h', colorHex: '#fff' },
        pad: '🌲'.repeat(130), // each 🌲 is 4 bytes, 130 * 4 = 520 bytes
      });
      expect(parseClientMessage(multiBytePayload)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseClientMessage('{t:hello')).toBeNull();
      expect(parseClientMessage('not-even-json')).toBeNull();
      expect(parseClientMessage('')).toBeNull();
    });

    it('returns null for unknown t', () => {
      const msg = JSON.stringify({ t: 'unknown_type' });
      expect(parseClientMessage(msg)).toBeNull();

      const missingT = JSON.stringify({
        x: 10,
        y: 20,
        zone: 'forest',
        facing: 'down',
        action: 'idle',
        pomo: 'none',
      });
      expect(parseClientMessage(missingT)).toBeNull();
    });

    it('returns null for an invalid enum value (zone, facing, action, pomo, emote)', () => {
      const validState = {
        t: 'state',
        x: 100,
        y: 200,
        zone: 'forest',
        facing: 'down',
        action: 'idle',
        pomo: 'none',
      };

      // Invalid zone
      expect(
        parseClientMessage(JSON.stringify({ ...validState, zone: 'desert' }))
      ).toBeNull();

      // Invalid facing
      expect(
        parseClientMessage(
          JSON.stringify({ ...validState, facing: 'diagonal' })
        )
      ).toBeNull();

      // Invalid action
      expect(
        parseClientMessage(JSON.stringify({ ...validState, action: 'flying' }))
      ).toBeNull();

      // Invalid pomo
      expect(
        parseClientMessage(JSON.stringify({ ...validState, pomo: 'working' }))
      ).toBeNull();

      // Invalid emote
      expect(
        parseClientMessage(JSON.stringify({ t: 'emote', e: 'fire' }))
      ).toBeNull();
    });

    it('returns null for NaN, Infinity or a non-number coordinate', () => {
      const baseState = {
        t: 'state',
        zone: 'forest',
        facing: 'down',
        action: 'idle',
        pomo: 'none',
      };

      // NaN in JSON serializes to null or isn't standard, but test non-number and JSON null
      expect(
        parseClientMessage(JSON.stringify({ ...baseState, x: null, y: 100 }))
      ).toBeNull();
      expect(
        parseClientMessage(JSON.stringify({ ...baseState, x: '100', y: 100 }))
      ).toBeNull();
      expect(
        parseClientMessage(JSON.stringify({ ...baseState, x: 100, y: true }))
      ).toBeNull();
      expect(
        parseClientMessage(
          '{"t":"state","x":NaN,"y":100,"zone":"forest","facing":"down","action":"idle","pomo":"none"}'
        )
      ).toBeNull();
      expect(
        parseClientMessage(
          '{"t":"state","x":Infinity,"y":100,"zone":"forest","facing":"down","action":"idle","pomo":"none"}'
        )
      ).toBeNull();
      expect(
        parseClientMessage(
          '{"t":"state","x":100,"y":-Infinity,"zone":"forest","facing":"down","action":"idle","pomo":"none"}'
        )
      ).toBeNull();
    });

    it('returns null for a raw name over 64 chars', () => {
      const validOutfit = { baseId: 'base1', hatId: 'hat1', colorHex: '#ffffff' };
      const longName = 'a'.repeat(65);
      expect(
        parseClientMessage(
          JSON.stringify({ t: 'hello', name: longName, outfit: validOutfit })
        )
      ).toBeNull();

      // 64 chars should be accepted (and then sanitized/truncated to 16 by sanitizeName)
      const exactly64 = 'a'.repeat(64);
      const parsed = parseClientMessage(
        JSON.stringify({ t: 'hello', name: exactly64, outfit: validOutfit })
      );
      expect(parsed).not.toBeNull();
      expect(parsed?.t).toBe('hello');
      if (parsed?.t === 'hello') {
        expect(parsed.name).toBe('a'.repeat(16));
      }
    });

    it('returns null for missing fields', () => {
      // Missing fields in hello
      expect(parseClientMessage(JSON.stringify({ t: 'hello' }))).toBeNull();
      expect(
        parseClientMessage(JSON.stringify({ t: 'hello', name: 'Alice' }))
      ).toBeNull();
      expect(
        parseClientMessage(
          JSON.stringify({
            t: 'hello',
            name: 'Alice',
            outfit: { baseId: 'b' }, // missing hatId and colorHex
          })
        )
      ).toBeNull();

      // Missing fields in state
      expect(
        parseClientMessage(JSON.stringify({ t: 'state', x: 10, y: 20 }))
      ).toBeNull();
      expect(
        parseClientMessage(
          JSON.stringify({
            t: 'state',
            x: 10,
            y: 20,
            zone: 'lake',
            facing: 'up',
            action: 'walk',
            // missing pomo
          })
        )
      ).toBeNull();

      // Missing fields in emote
      expect(parseClientMessage(JSON.stringify({ t: 'emote' }))).toBeNull();
    });
  });

  // Acceptance criterion:
  // Test: a valid `state` message parses to the typed object with `x`/`y` unchanged.
  it('parses a valid state message to the typed object with x/y unchanged', () => {
    const raw = JSON.stringify({
      t: 'state',
      x: 123.456,
      y: 789.012,
      zone: 'lake',
      facing: 'left',
      action: 'sit',
      pomo: 'focus',
    });

    const parsed = parseClientMessage(raw);
    expect(parsed).toEqual({
      t: 'state',
      x: 123.456,
      y: 789.012,
      zone: 'lake',
      facing: 'left',
      action: 'sit',
      pomo: 'focus',
    });
  });

  // Acceptance criterion:
  // Tests: `sanitizeName('  héllo\u0000 world!!  ')` → `'hllo world'`; a 30-char name is cut to 16; `''` → `'Wanderer'`.
  describe('sanitizeName tests', () => {
    it("sanitizeName('  héllo\\u0000 world!!  ') → 'hllo world'", () => {
      expect(sanitizeName('  héllo\u0000 world!!  ')).toBe('hllo world');
    });

    it('a 30-char name is cut to 16', () => {
      const name30 = 'abcdefghijklmnopqrstuvwxyz1234';
      expect(name30.length).toBe(30);
      const sanitized = sanitizeName(name30);
      expect(sanitized.length).toBe(16);
      expect(sanitized).toBe('abcdefghijklmnop');
    });

    it("'' → 'Wanderer'", () => {
      expect(sanitizeName('')).toBe('Wanderer');
      expect(sanitizeName('    ')).toBe('Wanderer');
      expect(sanitizeName('!@#$%^&*()')).toBe('Wanderer');
      expect(sanitizeName(null as unknown as string)).toBe('Wanderer');
      expect(sanitizeName(undefined as unknown as string)).toBe('Wanderer');
    });
  });

  // Acceptance criterion:
  // Test: `clampToWorld(-5, 99999)` → `(0, WORLD_HEIGHT_PX)`.
  it('clampToWorld(-5, 99999) → (0, WORLD_HEIGHT_PX)', () => {
    const clamped = clampToWorld(-5, 99999);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(WORLD_HEIGHT_PX);
    expect(clamped).toEqual({ x: 0, y: WORLD_HEIGHT_PX });

    // Also verify tuple destructuring
    const [cx, cy] = clamped;
    expect(cx).toBe(0);
    expect(cy).toBe(WORLD_HEIGHT_PX);
  });

  // Acceptance criterion:
  // Tests: `isValidRoomCode('pine-482')` is true; `'public'`, `'AB'` and `'a b'` are false.
  describe('isValidRoomCode tests', () => {
    it("isValidRoomCode('pine-482') is true", () => {
      expect(isValidRoomCode('pine-482')).toBe(true);
      expect(isValidRoomCode('abc')).toBe(true);
      expect(isValidRoomCode('a-1-b-2')).toBe(true);
      expect(isValidRoomCode('a'.repeat(32))).toBe(true);
    });

    it("'public', 'AB' and 'a b' are false", () => {
      expect(isValidRoomCode('public')).toBe(false);
      expect(isValidRoomCode('AB')).toBe(false);
      expect(isValidRoomCode('a b')).toBe(false);

      // Additional edge cases
      expect(isValidRoomCode('ab')).toBe(false); // too short (< 3)
      expect(isValidRoomCode('a'.repeat(33))).toBe(false); // too long (> 32)
      expect(isValidRoomCode('')).toBe(false);
      expect(isValidRoomCode('pine_482')).toBe(false); // underscore not in [a-z0-9-]
      expect(isValidRoomCode(null as unknown as string)).toBe(false);
    });
  });

  // Acceptance criterion:
  // The package has no runtime `dependencies`.
  it('has no runtime dependencies in package.json', () => {
    const pkgPath = resolve(__dirname, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.dependencies).toBeUndefined();
  });
});

describe('Additional protocol and P2P validator tests', () => {
  const sampleOutfit = { baseId: 'skin1', hatId: 'beanie', colorHex: '#4a90e2' };

  it('parses valid emote client message', () => {
    const msg = JSON.stringify({ t: 'emote', e: 'sparkle' });
    expect(parseClientMessage(msg)).toEqual({ t: 'emote', e: 'sparkle' });
  });

  it('parses server messages', () => {
    const player1 = {
      id: 'p1',
      name: 'Alice',
      x: 50,
      y: 60,
      zone: 'pub' as const,
      facing: 'right' as const,
      action: 'celebrate' as const,
      outfit: sampleOutfit,
      pomo: 'break' as const,
    };

    // welcome
    const welcomeRaw = JSON.stringify({
      t: 'welcome',
      id: 'p1',
      players: [player1],
    });
    expect(parseServerMessage(welcomeRaw)).toEqual({
      t: 'welcome',
      id: 'p1',
      players: [player1],
    });

    // snap
    const snapRaw = JSON.stringify({
      t: 'snap',
      players: [player1],
      left: ['p2', 'p3'],
    });
    expect(parseServerMessage(snapRaw)).toEqual({
      t: 'snap',
      players: [player1],
      left: ['p2', 'p3'],
    });

    // emote
    const emoteRaw = JSON.stringify({ t: 'emote', id: 'p1', e: 'coffee' });
    expect(parseServerMessage(emoteRaw)).toEqual({
      t: 'emote',
      id: 'p1',
      e: 'coffee',
    });

    // full
    const fullRaw = JSON.stringify({ t: 'full' });
    expect(parseServerMessage(fullRaw)).toEqual({ t: 'full' });

    // invalid server messages
    expect(parseServerMessage('invalid-json')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ t: 'unknown' }))).toBeNull();
    expect(
      parseServerMessage(JSON.stringify({ t: 'welcome', id: '' }))
    ).toBeNull();
    expect(
      parseServerMessage(
        JSON.stringify({
          t: 'snap',
          players: [{ ...player1, zone: 'invalid' }],
          left: [],
        })
      )
    ).toBeNull();
  });

  it('validates P2P player messages', () => {
    const validPlayer = {
      name: 'Bob',
      x: 100,
      y: 200,
      zone: 'forest',
      facing: 'left',
      action: 'vibe',
      outfit: sampleOutfit,
      pomo: 'none',
    };

    expect(validateP2PPlayer(validPlayer)).toEqual(validPlayer);
    expect(validateP2PPlayer(JSON.stringify(validPlayer))).toEqual(validPlayer);

    // invalid cases
    expect(validateP2PPlayer(null)).toBeNull();
    expect(validateP2PPlayer({ ...validPlayer, x: NaN })).toBeNull();
    expect(validateP2PPlayer({ ...validPlayer, zone: 'space' })).toBeNull();
    expect(validateP2PPlayer({ ...validPlayer, outfit: null })).toBeNull();
  });

  it('validates P2P emote messages', () => {
    expect(validateEmote({ e: 'wave' })).toEqual({ e: 'wave' });
    expect(validateEmote(JSON.stringify({ e: 'zzz' }))).toEqual({ e: 'zzz' });
    expect(validateEmote('heart')).toEqual({ e: 'heart' });

    expect(validateEmote(null)).toBeNull();
    expect(validateEmote({ e: 'invalid' })).toBeNull();
    expect(validateEmote(123)).toBeNull();
  });

  it('verifies all expected constants', () => {
    expect(TILE_SIZE).toBe(16);
    expect(MAP_WIDTH_TILES).toBe(128);
    expect(MAP_HEIGHT_TILES).toBe(64);
    expect(WORLD_WIDTH_PX).toBe(2048);
    expect(WORLD_HEIGHT_PX).toBe(1024);
    expect(PLAYER_SPEED_PX_S).toBe(80);
    expect(NET_SEND_HZ).toBe(10);
    expect(NET_HEARTBEAT_MS).toBe(2000);
    expect(MAX_NAME_LEN).toBe(16);
    expect(MAX_FRAME_BYTES).toBe(512);
    expect(P2P_MAX_PEERS).toBe(10);
    expect(EMOTE_HOLD_MS).toBe(3500);
    expect(AFK_MS).toBe(300000);
    expect(TELEPORT_SNAP_PX).toBe(128);
    expect(INTERP_DELAY_MS).toBe(140);
    expect(PUBLIC_ROOM_CODE).toBe('public');
    expect(EMOTE_IDS).toEqual([
      'heart',
      'coffee',
      'music',
      'wave',
      'zzz',
      'sparkle',
    ]);
  });
});
