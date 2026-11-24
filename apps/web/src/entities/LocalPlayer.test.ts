import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalPlayer } from './LocalPlayer';
import { gameEvents } from '../engine/events';
import { Camera } from '../engine/camera';
import { PLAYER_SPEED_PX_S, TILE_SIZE, type ZoneId } from '@lofi/shared';
import type { ParsedTiledMap } from '../engine/tiled';
import { parseTiledMap } from '../engine/tiled';
import { generateStarterMap } from '../engine/starterMapData';
import { StorageManager } from '../systems/StorageManager';
import { pomodoroController } from '../systems/PomodoroController';

function createMockMap(overrides?: Partial<ParsedTiledMap>): ParsedTiledMap {
  const width = 30;
  const height = 30;
  return {
    width,
    height,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    ground: new Array(width * height).fill(1),
    decor: new Array(width * height).fill(0),
    entities: new Array(width * height).fill(0),
    canopy: new Array(width * height).fill(0),
    collision: new Array(width * height).fill(0),
    spawn: {
      id: 1,
      name: 'spawn',
      x: 2 * TILE_SIZE,
      y: 2 * TILE_SIZE,
      tileX: 2,
      tileY: 2,
    },
    seats: [
      {
        id: 10,
        name: 'seat_log',
        x: 100,
        y: 100,
        tileX: 6,
        tileY: 6,
        seatKind: 'log',
      },
    ],
    landmarks: [
      {
        id: 'clearing',
        label: 'Clearing',
        radius: 48,
        x: 80,
        y: 80,
        tileX: 5,
        tileY: 5,
      },
    ],
    zoneTriggers: [
      {
        id: 20,
        name: 'trigger_forest',
        zone: 'forest',
        x: 0,
        y: 0,
        width: 15 * TILE_SIZE,
        height: 30 * TILE_SIZE,
      },
      {
        id: 21,
        name: 'trigger_lake',
        zone: 'lake',
        x: 15 * TILE_SIZE,
        y: 0,
        width: 15 * TILE_SIZE,
        height: 30 * TILE_SIZE,
      },
    ],
    campfires: [],
    doors: [
      {
        id: 30,
        name: 'door_exterior',
        doorId: 'pub_exterior',
        targetDoorId: 'pub_interior',
        x: 10 * TILE_SIZE,
        y: 12 * TILE_SIZE,
        tileX: 10,
        tileY: 12,
      },
      {
        id: 31,
        name: 'door_interior',
        doorId: 'pub_interior',
        targetDoorId: 'pub_exterior',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        tileX: 10,
        tileY: 10,
      },
    ],
    cameraFoci: [],
    ...overrides,
  };
}

describe('LocalPlayer', () => {
  beforeEach(() => {
    gameEvents.removeAllListeners();
  });

  // Acceptance criterion:
  // Test: entering a zone_trigger emits zoneChanged exactly once.
  it('entering a zone_trigger emits zoneChanged exactly once', () => {
    const map = createMockMap();
    const camera = new Camera();
    const player = new LocalPlayer(map, camera, undefined, {
      initialX: 50,
      initialY: 50,
      initialZone: 'forest',
      skipPixi: true,
    });

    const zoneChangedListener = vi.fn();
    gameEvents.on('zoneChanged', zoneChangedListener);

    // Initial position is in 'forest'
    expect(player.zone).toBe('forest');
    expect(zoneChangedListener).not.toHaveBeenCalled();

    // Step across boundary into 'lake' (x >= 15 * 16 = 240)
    player.x = 260;
    player.y = 50;
    player.update(0.016);

    // Must emit zoneChanged with 'lake'
    expect(player.zone).toBe('lake');
    expect(zoneChangedListener).toHaveBeenCalledTimes(1);
    expect(zoneChangedListener).toHaveBeenCalledWith({ zone: 'lake' });

    // Subsequent updates within the same zone MUST NOT emit again
    player.x = 270;
    player.y = 55;
    player.update(0.016);
    expect(zoneChangedListener).toHaveBeenCalledTimes(1);

    // Moving further inside 'lake'
    player.update(0.016);
    expect(zoneChangedListener).toHaveBeenCalledTimes(1);

    // Returning to 'forest' emits exactly once for the new transition
    player.x = 100;
    player.y = 50;
    player.update(0.016);
    expect(player.zone).toBe('forest');
    expect(zoneChangedListener).toHaveBeenCalledTimes(2);
    expect(zoneChangedListener).toHaveBeenLastCalledWith({ zone: 'forest' });
  });

  // Acceptance criterion:
  // Test: entering a door places the player next to the paired door.
  it('entering a door places the player next to the paired door', () => {
    // Map with door_exterior at (10, 12) paired with door_interior at (10, 10)
    // Wall in between at y = 11
    const map = createMockMap();
    map.collision[11 * map.width + 10] = 1; // Solid wall between doors

    const camera = new Camera();
    const player = new LocalPlayer(map, camera, undefined, {
      initialX: 10 * TILE_SIZE + 8,
      initialY: 14 * TILE_SIZE + 8,
      skipPixi: true,
    });

    const teleportListener = vi.fn();
    gameEvents.on('teleported', teleportListener);

    // Step onto door_exterior at (10, 12)
    player.x = 10 * TILE_SIZE + 8;
    player.y = 12 * TILE_SIZE + 8;
    player.update(0.016);

    // Target door is door_interior at (10, 10).
    // The player must be placed next to the paired door, one tile outward!
    // Since step direction from (10, 12) to (10, 10) is North (dy = -1),
    // one tile outward is North of (10, 10), which is (10, 9)!
    const expectedTileX = 10;
    const expectedTileY = 9;
    const expectedPxX = expectedTileX * TILE_SIZE + 8;
    const expectedPxY = expectedTileY * TILE_SIZE + 8;

    expect(player.x).toBe(expectedPxX);
    expect(player.y).toBe(expectedPxY);

    // Verify player is not on the door itself
    const curTileX = Math.floor(player.x / TILE_SIZE);
    const curTileY = Math.floor(player.y / TILE_SIZE);
    expect(curTileX).toBe(10);
    expect(curTileY).toBe(9); // 1 tile outward from door at (10, 10)

    expect(teleportListener).toHaveBeenCalledWith({
      x: expectedPxX,
      y: expectedPxY,
    });
  });

  // Acceptance criterion:
  // Test: E within 20 px of a seat gives action='sit' at the seat position; a movement key afterwards gives action='walk'.
  it("E within 20 px of a seat gives action='sit' at the seat position; a movement key afterwards gives action='walk'", () => {
    const map = createMockMap();
    // Seat is at (100, 100)
    const seat = map.seats[0];
    const camera = new Camera();

    // Place player at (108, 100), distance 8 px <= 20 px
    const player = new LocalPlayer(map, camera, undefined, {
      initialX: 108,
      initialY: 100,
      skipPixi: true,
    });

    expect(player.action).toBe('idle');

    // Press E
    player.handleKeyDown('KeyE');

    // Gives action='sit' at the seat position (foot y + 2 px)
    expect(player.action).toBe('sit');
    expect(player.x).toBe(seat.x);
    expect(player.y).toBe(seat.y + 2);

    // A movement key afterwards gives action='walk'
    player.handleKeyDown('KeyW');
    expect(player.action).toBe('walk');

    // Update with movement key down moves the player
    player.update(0.016);
    expect(player.action).toBe('walk');
    expect(player.y).toBeLessThan(seat.y + 2); // Moved up
  });

  // Acceptance criterion:
  // Test: manual input while auto-stroll is on turns it off.
  it('manual input while auto-stroll is on turns it off', () => {
    const map = createMockMap();
    const camera = new Camera();
    const player = new LocalPlayer(map, camera, undefined, {
      initialX: 50,
      initialY: 50,
      skipPixi: true,
    });

    const localInputListener = vi.fn();
    gameEvents.on('localInput', localInputListener);

    // 1. Turn Auto-Stroll ON
    player.setAutoStroll(true);
    expect(player.isAutoStroll).toBe(true);

    let strollStateDuringEmit: boolean | undefined;
    gameEvents.on('localInput', () => {
      strollStateDuringEmit = player.isAutoStroll;
    });

    // 2. Manual keyboard input turns it off
    player.handleKeyDown('KeyD');
    expect(player.isAutoStroll).toBe(false);
    expect(strollStateDuringEmit).toBe(false);
    expect(localInputListener).toHaveBeenCalled();

    // 3. Turn Auto-Stroll ON again
    player.setAutoStroll(true);
    expect(player.isAutoStroll).toBe(true);

    // 4. Manual click/tap-to-walk turns it off
    player.walkToTile(4, 4);
    expect(player.isAutoStroll).toBe(false);
    expect(strollStateDuringEmit).toBe(false);
  });

  it('tapping a seat turns off auto-stroll, sits, and emits localInput', () => {
    const map = createMockMap();
    const seat = map.seats[0]; // at (100, 100)
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 108,
      initialY: 100,
      skipPixi: true,
    });

    const localInputListener = vi.fn();
    let strollStateDuringEmit: boolean | undefined;
    gameEvents.on('localInput', () => {
      localInputListener();
      strollStateDuringEmit = player.isAutoStroll;
    });

    player.setAutoStroll(true);
    expect(player.isAutoStroll).toBe(true);

    const sat = player.tapSeat();
    expect(sat).toBe(true);
    expect(player.isAutoStroll).toBe(false);
    expect(strollStateDuringEmit).toBe(false);
    expect(player.action).toBe('sit');
    expect(player.x).toBe(seat.x);
    expect(player.y).toBe(seat.y + 2);
    expect(localInputListener).toHaveBeenCalled();
  });

  it('ignores WASD and arrows while an <input> has focus and does not emit localInput', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 50,
      initialY: 50,
      skipPixi: true,
    });

    const localInputListener = vi.fn();
    gameEvents.on('localInput', localInputListener);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    player.handleKeyDown('KeyW');
    player.handleKeyDown('ArrowDown');
    player.update(0.016);

    expect(player.x).toBe(50);
    expect(player.y).toBe(50);
    expect(localInputListener).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('getLocalState() returns {x, y, zone, facing, action}', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 64,
      initialY: 48,
      initialZone: 'forest',
      skipPixi: true,
    });

    const state = player.getLocalState();
    expect(state).toEqual({
      x: 64,
      y: 48,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
    });
  });

  it('stops pathfinding when keyboard input starts', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 50,
      initialY: 50,
      skipPixi: true,
    });

    // Start walking to tile (10, 10)
    const started = player.walkToTile(10, 10);
    expect(started).toBe(true);
    expect(player.currentPath.length).toBeGreaterThan(0);

    // Keyboard input starts -> cancels path
    player.handleKeyDown('KeyA');
    expect(player.currentPath.length).toBe(0);
  });

  it('camera follows the player on tick', () => {
    const map = createMockMap();
    const camera = new Camera();
    camera.updateViewport(800, 600);

    // Place player at (400, 300) so camera is within world bounds without clamping
    const player = new LocalPlayer(map, camera, undefined, {
      initialX: 400,
      initialY: 300,
      skipPixi: true,
    });

    player.update(0.016);
    // Camera center should align with player (roundedX + viewW/2 ~ player.x)
    const viewW = camera.viewportW / camera.zoom;
    const viewH = camera.viewportH / camera.zoom;
    expect(camera.roundedX + viewW / 2).toBeCloseTo(player.x, 0);
    expect(camera.roundedY + viewH / 2).toBeCloseTo(player.y, 0);
  });

  // End-to-end verification walkthrough: walk forest → lake → pub and sit
  it('starter map walkthrough: walk forest -> lake -> pub and sit', () => {
    const rawMap = generateStarterMap();
    const starterMap = parseTiledMap(rawMap);
    const camera = new Camera();
    camera.updateViewport(800, 600);

    const player = new LocalPlayer(starterMap, camera, undefined, {
      skipPixi: true,
    });

    // 1. Spawns in Forest
    expect(player.zone).toBe('forest');
    expect(player.action).toBe('idle');

    // 2. Walk to Lake (near lakeside dock at tile (20, 31))
    const walkedToLake = player.walkToTile(20, 31);
    expect(walkedToLake).toBe(true);
    // Simulate walking along the path until reached
    while (player.currentPath.length > 0) {
      player.update(0.1);
    }
    expect(player.zone).toBe('lake');

    // 3. Walk to Pub Exterior Door at tile (115, 29)
    const walkedToPubDoor = player.walkToTile(115, 29);
    expect(walkedToPubDoor).toBe(true);
    while (player.currentPath.length > 0) {
      player.update(0.1);
    }
    // Stepping on the pub exterior door moves player inside the pub (one tile outward from interior door)
    // Pub interior door is at (115, 27); outward tile is (115, 26)
    expect(player.zone).toBe('pub');
    expect(Math.floor(player.x / TILE_SIZE)).toBe(115);
    expect(Math.floor(player.y / TILE_SIZE)).toBe(26);

    // 4. Walk to pub stool at (113, 21)
    const walkedToStool = player.walkToTile(113, 21);
    expect(walkedToStool).toBe(true);
    while (player.currentPath.length > 0) {
      player.update(0.1);
    }
    expect(player.getNearestSeat(20)).not.toBeNull();

    // 5. Sit on stool
    player.handleKeyDown('KeyE');
    expect(player.action).toBe('sit');
    const stool = starterMap.seats.find((s) => s.tileX === 113 && s.tileY === 21)!;
    expect(player.x).toBe(stool.x);
    expect(player.y).toBe(stool.y + 2);

    // 6. Movement key stands up
    player.handleKeyDown('KeyS');
    expect(player.action).toBe('walk');
  });

  it('V key toggles vibe action on and off', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    expect(player.action).toBe('idle');

    // Press V -> vibe
    player.handleKeyDown('KeyV');
    expect(player.action).toBe('vibe');

    // Press V again -> idle
    player.handleKeyDown('KeyV');
    expect(player.action).toBe('idle');
  });

  it('LocalPlayer renders through PlayerAvatar when visual layers are provided', () => {
    const map = createMockMap();
    const mockLayers: any = {
      entityLayer: { addChild: vi.fn() },
      worldUiLayer: { addChild: vi.fn() },
    };

    const player = new LocalPlayer(map, undefined, mockLayers, {
      skipPixi: false,
    });

    expect(player.avatar).toBeDefined();
    expect(player.container).toBe(player.avatar);
    expect(mockLayers.entityLayer.addChild).toHaveBeenCalledWith(player.avatar);

    player.destroy();
  });

  it('celebrate() plays bounce animation for 3000 ms through PlayerAvatar and reverts to previous action', () => {
    const map = createMockMap();
    const mockLayers: any = {
      entityLayer: { addChild: vi.fn() },
      worldUiLayer: { addChild: vi.fn() },
    };

    const player = new LocalPlayer(map, undefined, mockLayers, {
      skipPixi: false,
    });

    const start = 10000;
    vi.spyOn(Date, 'now').mockReturnValue(start);

    player.celebrate();
    expect(player.action).toBe('celebrate');
    expect(player.avatar!.action).toBe('celebrate');

    // Midway through celebrate (1500 ms elapsed)
    vi.spyOn(Date, 'now').mockReturnValue(start + 1500);
    player.update(0.016);
    expect(player.action).toBe('celebrate');
    expect(player.avatar!.action).toBe('celebrate');

    // After 3000 ms elapsed (+3001 ms), reverts to previous action ('idle')
    vi.spyOn(Date, 'now').mockReturnValue(start + 3001);
    player.update(0.016);
    expect(player.action).toBe('idle');
    expect(player.avatar!.action).toBe('idle');

    player.destroy();
  });

  it('AfkDetector does not put player to sleep while auto-stroll is active', () => {
    vi.useFakeTimers();
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    player.setAutoStroll(true);
    expect(player.isAutoStroll).toBe(true);
    expect(player.afkDetector?.isSuppressed()).toBe(true);

    // Advance past AFK threshold (300 000 ms)
    vi.advanceTimersByTime(300000);
    expect(player.afkDetector?.isSleeping).toBe(false);
    expect(player.action).not.toBe('sleep');

    player.destroy();
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test: during focus the AfkDetector never triggers sleep.
  it('during focus the AfkDetector never triggers sleep', () => {
    vi.useFakeTimers();
    pomodoroController.reset();
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    pomodoroController.start();
    expect(pomodoroController.phase).toBe('focus');
    expect(player.afkDetector?.isSuppressed()).toBe(true);

    // Advance past AFK threshold (300 000 ms)
    vi.advanceTimersByTime(300000);
    expect(player.afkDetector?.isSleeping).toBe(false);
    expect(player.action).not.toBe('sleep');

    // Control case: reset pomodoro out of focus
    pomodoroController.reset();
    expect(player.afkDetector?.isSuppressed()).toBe(false);

    // Advance past AFK threshold again (300 000 ms)
    vi.advanceTimersByTime(300000);
    expect(player.afkDetector?.isSleeping).toBe(true);
    expect(player.action).toBe('sleep');

    player.destroy();
    pomodoroController.reset();
    vi.useRealTimers();
  });

  it('updates live avatar when StorageManager preferences change', () => {
    const map = createMockMap();
    const mockLayers: any = {
      entityLayer: { addChild: vi.fn() },
      worldUiLayer: { addChild: vi.fn() },
    };

    const player = new LocalPlayer(map, undefined, mockLayers, {
      skipPixi: false,
    });

    StorageManager.update({
      profile: {
        name: 'Robin',
        outfit: {
          baseId: 'char_base',
          hatId: 'beanie',
          colorHex: '#4a7c59',
        },
      },
      showNames: true,
    });

    expect(player.avatar!.playerName).toBe('Robin');
    expect(player.avatar!.nameplate.text).toBe('Robin');
    expect(player.avatar!.hatLayer.visible).toBe(true);
    expect(player.avatar!.outfit.colorHex).toBe('#4a7c59');

    player.destroy();
  });

  // Acceptance criterion:
  // Test: pressing '3' emits 'localEmote' with 'music'.
  it("pressing '3' emits 'localEmote' with 'music'", () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    const emoteListener = vi.fn();
    const inputListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);
    gameEvents.on('localInput', inputListener);

    player.handleKeyDown('3');

    expect(emoteListener).toHaveBeenCalledTimes(1);
    expect(emoteListener).toHaveBeenCalledWith({ emote: 'music' });
    expect(inputListener).toHaveBeenCalled();

    player.destroy();
  });

  // Acceptance criterion:
  // Test: presses 500 ms apart emit once; presses 1100 ms apart emit twice.
  it('presses 500 ms apart emit once; presses 1100 ms apart emit twice', () => {
    vi.useFakeTimers();
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    const emoteListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);

    // 1. Initial press at t = 0
    player.handleKeyDown('3');
    expect(emoteListener).toHaveBeenCalledTimes(1);
    expect(emoteListener).toHaveBeenLastCalledWith({ emote: 'music' });

    // 2. Second press at t = 500 ms (500 ms apart): must be ignored due to 1000 ms cooldown
    vi.advanceTimersByTime(500);
    player.handleKeyDown('3');
    expect(emoteListener).toHaveBeenCalledTimes(1);

    // 3. Third press at t = 1100 ms (1100 ms after the first accepted press): must emit again
    vi.advanceTimersByTime(600); // 500 + 600 = 1100 ms
    player.handleKeyDown('3');
    expect(emoteListener).toHaveBeenCalledTimes(2);
    expect(emoteListener).toHaveBeenLastCalledWith({ emote: 'music' });

    player.destroy();
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test: a hotkey pressed while an <input> has focus emits nothing.
  it('a hotkey pressed while an <input> has focus emits nothing', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    const emoteListener = vi.fn();
    const inputListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);
    gameEvents.on('localInput', inputListener);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Try pressing emote hotkeys while input has focus
    player.handleKeyDown('3');
    player.handleKeyDown('Digit1');
    player.handleKeyDown('Digit2');

    expect(emoteListener).not.toHaveBeenCalled();
    expect(inputListener).not.toHaveBeenCalled();

    document.body.removeChild(input);
    player.destroy();
  });

  it('each accepted local emote counts as input and wakes the player from AFK', () => {
    vi.useFakeTimers();
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    // Advance 300 000 ms to trigger AFK sleep
    vi.advanceTimersByTime(300000);
    expect(player.afkDetector?.isSleeping).toBe(true);
    expect(player.action).toBe('sleep');

    const emoteListener = vi.fn();
    const inputListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);
    gameEvents.on('localInput', inputListener);

    // Press emote hotkey
    player.handleKeyDown('3');

    expect(emoteListener).toHaveBeenCalledWith({ emote: 'music' });
    expect(inputListener).toHaveBeenCalled();
    expect(player.afkDetector?.isSleeping).toBe(false);
    expect(player.action).toBe('idle');

    player.destroy();
    vi.useRealTimers();
  });

  it('hotkeys 1 through 6 map to EMOTE_IDS heart, coffee, music, wave, zzz, sparkle', () => {
    vi.useFakeTimers();
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      skipPixi: true,
    });

    const expected = [
      { key: '1', emote: 'heart' },
      { key: '2', emote: 'coffee' },
      { key: '3', emote: 'music' },
      { key: '4', emote: 'wave' },
      { key: '5', emote: 'zzz' },
      { key: '6', emote: 'sparkle' },
    ];

    for (const { key, emote } of expected) {
      const emoteListener = vi.fn();
      const unsub = gameEvents.on('localEmote', emoteListener);

      player.handleKeyDown(key);
      expect(emoteListener).toHaveBeenCalledWith({ emote });
      unsub();

      // Advance past cooldown
      vi.advanceTimersByTime(1100);
    }

    player.destroy();
    vi.useRealTimers();
  });
});
