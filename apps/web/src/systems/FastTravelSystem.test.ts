import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FastTravelSystem,
  findOpenTileNear,
  teleportNear,
  DEFAULT_LANDMARKS,
} from './FastTravelSystem';
import {
  StorageManager,
  resetStorageManager,
} from './StorageManager';
import { gameEvents } from '../engine/events';
import { LocalPlayer } from '../entities/LocalPlayer';
import { Camera } from '../engine/camera';
import { generateStarterMap } from '../engine/starterMapData';
import { parseTiledMap, type ParsedTiledMap } from '../engine/tiled';
import { TILE_SIZE } from '@lofi/shared';

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
    seats: [],
    landmarks: [
      {
        id: 'forest_clearing',
        label: 'Forest Clearing',
        radius: 64,
        x: 60,
        y: 60,
        tileX: 3,
        tileY: 3,
      },
      {
        id: 'lakeside_dock',
        label: 'Lakeside Dock',
        radius: 48,
        x: 200,
        y: 200,
        tileX: 12,
        tileY: 12,
      },
      {
        id: 'cozy_pub',
        label: 'Cozy Pub',
        radius: 64,
        x: 350,
        y: 350,
        tileX: 21,
        tileY: 21,
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
        name: 'trigger_pub',
        zone: 'pub',
        x: 15 * TILE_SIZE,
        y: 0,
        width: 15 * TILE_SIZE,
        height: 30 * TILE_SIZE,
      },
    ],
    campfires: [],
    doors: [],
    cameraFoci: [],
    ...overrides,
  };
}

describe('FastTravelSystem', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorageManager();
    gameEvents.removeAllListeners();
    vi.restoreAllMocks();
  });

  // Acceptance Criterion 1:
  // Test: entering the lakeside_dock radius the first time unlocks it and shows the toast; a second entry shows no toast.
  it('entering the lakeside_dock radius the first time unlocks it and shows the toast; a second entry shows no toast', () => {
    const map = createMockMap();
    const storage = new StorageManager('test-storage-ft');
    const fastTravel = new FastTravelSystem(map, storage);

    const toastListener = vi.fn();
    fastTravel.subscribeToast(toastListener);

    // Initial state: lakeside_dock is locked
    expect(fastTravel.isUnlocked('lakeside_dock')).toBe(false);
    expect(fastTravel.toast).toBeNull();

    // 1. First entry into lakeside_dock radius (landmark at x=200, y=200, radius=48)
    const entered1 = fastTravel.checkPosition(200, 200);
    expect(entered1).not.toBeNull();
    expect(entered1?.id).toBe('lakeside_dock');

    // It unlocks lakeside_dock in storage
    expect(fastTravel.isUnlocked('lakeside_dock')).toBe(true);
    expect(storage.get().unlockedLandmarks).toContain('lakeside_dock');

    // It shows the toast 'Discovered: Lakeside Dock'
    expect(fastTravel.toast).toBe('Discovered: Lakeside Dock');
    expect(toastListener).toHaveBeenCalledWith('Discovered: Lakeside Dock');

    const callsAfterFirstEntry = toastListener.mock.calls.length;

    // 2. Second entry into lakeside_dock radius
    const entered2 = fastTravel.checkPosition(205, 205);
    expect(entered2).toBeNull(); // Already unlocked landmarks do nothing

    // A second entry shows no toast
    expect(toastListener).toHaveBeenCalledTimes(callsAfterFirstEntry);
  });

  it('LocalPlayer entering the lakeside_dock radius via update(dt) unlocks it and shows toast', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 50,
      initialY: 50,
      skipPixi: true,
    });

    const toastListener = vi.fn();
    gameEvents.on('toast', toastListener);

    expect(player.fastTravelSystem?.isUnlocked('lakeside_dock')).toBe(false);

    // Move player inside lakeside_dock radius (200, 200)
    player.x = 200;
    player.y = 200;
    player.update(0.016);

    expect(player.fastTravelSystem?.isUnlocked('lakeside_dock')).toBe(true);
    expect(toastListener).toHaveBeenCalledTimes(1);
    expect(toastListener).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Discovered: Lakeside Dock' })
    );

    // Second update at same position shows no new toast
    player.update(0.016);
    expect(toastListener).toHaveBeenCalledTimes(1);
  });

  // Acceptance Criterion 2:
  // Test: with fresh storage, only forest_clearing is unlocked.
  it('with fresh storage, only forest_clearing is unlocked', () => {
    const fastTravel = new FastTravelSystem();

    const unlocked = fastTravel.getUnlockedLandmarks();
    expect(unlocked).toEqual(['forest_clearing']);
    expect(fastTravel.isUnlocked('forest_clearing')).toBe(true);
    expect(fastTravel.isUnlocked('lakeside_dock')).toBe(false);
    expect(fastTravel.isUnlocked('cozy_pub')).toBe(false);

    // Direct check against fresh StorageManager
    const freshPrefs = StorageManager.get();
    expect(freshPrefs.unlockedLandmarks).toEqual(['forest_clearing']);
  });

  // Acceptance Criterion 3:
  // Test: findOpenTileNear returns an adjacent walkable tile, searches the next ring when all 8 neighbours are solid, and never returns a solid tile.
  it('findOpenTileNear returns an adjacent walkable tile, searches the next ring when all 8 neighbours are solid, and never returns a solid tile', () => {
    // 5x5 grid
    // 0 = walkable, 1 = solid
    const width = 5;
    const height = 5;

    // Case 1: Point is at (2, 2). Ring 1 has walkable neighbours (e.g. (2, 1)).
    // Center (2, 2) is walkable, but findOpenTileNear must NEVER return the point's own tile!
    const openGrid: any = {
      width,
      height,
      collision: new Array(width * height).fill(0),
    };

    const result1 = findOpenTileNear(openGrid, 2, 2);
    expect(result1).not.toBeNull();
    // Must be adjacent tile (ring 1)
    expect(Math.max(Math.abs(result1!.tileX - 2), Math.abs(result1!.tileY - 2))).toBe(1);
    // Never the point's own tile
    expect(result1!.tileX === 2 && result1!.tileY === 2).toBe(false);
    // Never returns a solid tile
    expect(openGrid.collision[result1!.tileY * width + result1!.tileX]).toBe(0);

    // Case 2: Ring 1 has all 8 neighbours solid!
    // Grid layout:
    // .  .  .  .  .   (y=0: all walkable)
    // .  1  1  1  .   (y=1: ring 1 north solid)
    // .  1  C  1  .   (y=2: ring 1 west & east solid, center C=(2, 2))
    // .  1  1  1  .   (y=3: ring 1 south solid)
    // .  .  .  .  .   (y=4: all walkable)
    const enclosedGrid: any = {
      width,
      height,
      collision: [
        0, 0, 0, 0, 0,
        0, 1, 1, 1, 0,
        0, 1, 0, 1, 0,
        0, 1, 1, 1, 0,
        0, 0, 0, 0, 0,
      ],
    };

    const result2 = findOpenTileNear(enclosedGrid, 2, 2);
    expect(result2).not.toBeNull();
    // Searches the next ring (ring 2) when all 8 neighbours are solid
    expect(Math.max(Math.abs(result2!.tileX - 2), Math.abs(result2!.tileY - 2))).toBe(2);
    // Never returns a solid tile
    expect(enclosedGrid.collision[result2!.tileY * width + result2!.tileX]).toBe(0);

    // Case 3: Completely solid map returns null and never a solid tile
    const allSolidGrid: any = {
      width,
      height,
      collision: new Array(width * height).fill(1),
    };
    const result3 = findOpenTileNear(allSolidGrid, 2, 2);
    expect(result3).toBeNull();
  });

  // Acceptance Criterion 4:
  // Test: teleporting from the forest to the pub landmark emits teleported, then zoneChanged {zone:'pub'}.
  it("teleporting from the forest to the pub landmark emits teleported, then zoneChanged {zone:'pub'}", async () => {
    const rawMap = generateStarterMap();
    const starterMap = parseTiledMap(rawMap);
    const camera = new Camera();
    camera.updateViewport(800, 600);

    const player = new LocalPlayer(starterMap, camera, undefined, {
      skipPixi: true,
    });

    // Verify player spawns in forest
    expect(player.zone).toBe('forest');

    const emittedEvents: Array<{ event: string; payload: any }> = [];
    gameEvents.on('teleported', (payload) => {
      emittedEvents.push({ event: 'teleported', payload });
    });
    gameEvents.on('zoneChanged', (payload) => {
      emittedEvents.push({ event: 'zoneChanged', payload });
    });

    // Pub landmark is locked initially; travel must be rejected
    expect(player.teleportToLandmark('cozy_pub')).toBe(false);

    // Unlock pub landmark so it can be fast-traveled to
    player.fastTravelSystem?.unlockLandmark('cozy_pub');

    // Teleport from forest to pub landmark
    await player.teleportToLandmark('cozy_pub');

    // Must emit teleported, then zoneChanged {zone:'pub'}
    expect(emittedEvents.length).toBe(2);
    expect(emittedEvents[0].event).toBe('teleported');
    expect(emittedEvents[0].payload.x).toBeGreaterThan(100 * TILE_SIZE);
    expect(emittedEvents[1].event).toBe('zoneChanged');
    expect(emittedEvents[1].payload).toEqual({ zone: 'pub' });

    // Player zone is now pub
    expect(player.zone).toBe('pub');
  });

  it('teleportToLandmark also works with landmark shorthand "pub"', async () => {
    const rawMap = generateStarterMap();
    const starterMap = parseTiledMap(rawMap);
    const player = new LocalPlayer(starterMap, undefined, undefined, {
      skipPixi: true,
    });

    // Unlock pub landmark
    player.fastTravelSystem?.unlockLandmark('cozy_pub');

    const teleportSpy = vi.fn();
    gameEvents.on('teleported', teleportSpy);

    await player.teleportToLandmark('pub');
    expect(teleportSpy).toHaveBeenCalled();
    expect(player.zone).toBe('pub');
  });

  it('teleportToLandmark rejects locked landmarks and returns false', () => {
    const map = createMockMap();
    const storage = new StorageManager('test-storage-ft-locked');
    const fastTravel = new FastTravelSystem(map, storage);

    // lakeside_dock is locked
    expect(fastTravel.isUnlocked('lakeside_dock')).toBe(false);
    const result = fastTravel.teleportToLandmark('lakeside_dock');
    expect(result).toBe(false);
  });

  it('teleportNear(x, y) helper moves player to nearest open tile next to point', () => {
    const map = createMockMap();
    const player = new LocalPlayer(map, undefined, undefined, {
      initialX: 32,
      initialY: 32,
      skipPixi: true,
    });

    // Friend is at (100, 100) (tile (6, 6))
    const friendX = 6 * TILE_SIZE + 8;
    const friendY = 6 * TILE_SIZE + 8;

    const teleportSpy = vi.fn();
    gameEvents.on('teleported', teleportSpy);

    const ok = player.teleportNear(friendX, friendY);
    expect(ok).toBe(true);
    expect(teleportSpy).toHaveBeenCalled();

    // Verify player is on an adjacent tile, not friend's exact tile
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);
    expect(Math.max(Math.abs(playerTileX - 6), Math.abs(playerTileY - 6))).toBe(1);
  });
});
