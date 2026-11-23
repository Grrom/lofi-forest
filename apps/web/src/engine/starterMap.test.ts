import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
  PLAYER_SPEED_PX_S,
  TILE_SIZE,
} from '@lofi/shared';
import { parseTiledMap, bfsReachableLandmarks } from './tiled';
import { serializeStarterMap } from './starterMapData';

describe('Starter Map (starter.tmj)', () => {
  const mapPath = resolve(__dirname, '../../public/assets/maps/starter.tmj');
  const rawJson = JSON.parse(readFileSync(mapPath, 'utf-8'));
  const parsed = parseTiledMap(rawJson);

  // Acceptance criterion:
  // Test: parsed starter.tmj has exactly one spawn; landmarks forest_clearing, lakeside_dock and cozy_pub; at least one camera_focus per zone; size equal to MAP_WIDTH_TILES×MAP_HEIGHT_TILES.
  it('parsed starter.tmj has exactly one spawn; landmarks forest_clearing, lakeside_dock and cozy_pub; at least one camera_focus per zone; size equal to MAP_WIDTH_TILES×MAP_HEIGHT_TILES', () => {
    // Size check
    expect(parsed.width).toBe(MAP_WIDTH_TILES);
    expect(parsed.height).toBe(MAP_HEIGHT_TILES);

    // Exactly one spawn
    const spawnObjects = rawJson.layers
      .find((l: any) => l.name === 'objects')
      ?.objects.filter((o: any) => o.type === 'spawn');
    expect(spawnObjects).toHaveLength(1);
    expect(parsed.spawn).toBeDefined();
    expect(parsed.spawn.name).toBe('spawn');

    // Landmarks: forest_clearing, lakeside_dock, cozy_pub
    const landmarkIds = parsed.landmarks.map((l) => l.id);
    expect(landmarkIds).toContain('forest_clearing');
    expect(landmarkIds).toContain('lakeside_dock');
    expect(landmarkIds).toContain('cozy_pub');

    // At least one camera_focus per zone (forest, lake, pub)
    const focusZones = parsed.cameraFoci.map((f) => f.zone);
    expect(focusZones).toContain('forest');
    expect(focusZones).toContain('lake');
    expect(focusZones).toContain('pub');
  });

  // Acceptance criterion:
  // Test: the spawn tile and every seat tile are not solid.
  it('the spawn tile and every seat tile are not solid', () => {
    const { width, collision, spawn, seats } = parsed;

    // Spawn tile must not be solid
    const spawnSolid = collision[spawn.tileY * width + spawn.tileX];
    expect(spawnSolid).toBe(0);

    // Every seat tile must not be solid
    expect(seats.length).toBeGreaterThan(0);
    for (const seat of seats) {
      const seatSolid = collision[seat.tileY * width + seat.tileX];
      expect(
        seatSolid,
        `Seat "${seat.name}" at (${seat.tileX}, ${seat.tileY}) must not be solid`
      ).toBe(0);
    }
  });

  // Acceptance criterion:
  // Test: a BFS over non-solid tiles from spawn reaches every landmark when door pairs count as connected, and the pub is reachable only via its door.
  it('a BFS over non-solid tiles from spawn reaches every landmark when door pairs count as connected, and the pub is reachable only via its door', () => {
    // 1. Without door pairs connected:
    // Pub interior is completely walled off, so cozy_pub MUST NOT be reachable.
    const reachedWithoutDoors = bfsReachableLandmarks(parsed, false);
    expect(reachedWithoutDoors.has('forest_clearing')).toBe(true);
    expect(reachedWithoutDoors.has('lakeside_dock')).toBe(true);
    expect(
      reachedWithoutDoors.has('cozy_pub'),
      'The pub must NOT be reachable without its door'
    ).toBe(false);

    // 2. With door pairs connected:
    // Every landmark is reachable.
    const reachedWithDoors = bfsReachableLandmarks(parsed, true);
    expect(reachedWithDoors.has('forest_clearing')).toBe(true);
    expect(reachedWithDoors.has('lakeside_dock')).toBe(true);
    expect(reachedWithDoors.has('cozy_pub')).toBe(true);
  });

  // Outdoor end-to-end walking is 20-30 s at PLAYER_SPEED_PX_S
  it('outdoor end-to-end walking from lakeside_dock to pub exterior door is 20-30 s at PLAYER_SPEED_PX_S', () => {
    const dockLandmark = parsed.landmarks.find((l) => l.id === 'lakeside_dock')!;
    const pubExteriorDoor = parsed.doors.find((d) => d.doorId === 'pub_exterior')!;

    const startX = dockLandmark.tileX;
    const startY = dockLandmark.tileY;
    const targetX = pubExteriorDoor.tileX;
    const targetY = pubExteriorDoor.tileY;

    // BFS shortest path on parsed.collision
    const queue: Array<{ x: number; y: number; dist: number }> = [
      { x: startX, y: startY, dist: 0 },
    ];
    const visited = new Set<number>();
    visited.add(startY * parsed.width + startX);

    let shortestDistanceTiles: number | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === targetX && current.y === targetY) {
        shortestDistanceTiles = current.dist;
        break;
      }

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < parsed.width && n.y >= 0 && n.y < parsed.height) {
          const idx = n.y * parsed.width + n.x;
          if (!visited.has(idx) && parsed.collision[idx] === 0) {
            visited.add(idx);
            queue.push({ x: n.x, y: n.y, dist: current.dist + 1 });
          }
        }
      }
    }

    expect(shortestDistanceTiles).not.toBeNull();
    const walkingTimeSec = (shortestDistanceTiles! * TILE_SIZE) / PLAYER_SPEED_PX_S;
    expect(walkingTimeSec).toBeGreaterThanOrEqual(20);
    expect(walkingTimeSec).toBeLessThanOrEqual(30);
  });

  // Acceptance criterion:
  // Test: running the generator reproduces the committed starter.tmj byte for byte.
  it('running the generator reproduces the committed starter.tmj byte for byte', () => {
    const freshJson = serializeStarterMap();
    const committedContent = readFileSync(mapPath, 'utf-8');

    expect(freshJson).toBe(committedContent);
  });
});
