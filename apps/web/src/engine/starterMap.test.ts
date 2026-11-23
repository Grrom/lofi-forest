import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
} from '@lofi/shared';
import { parseTiledMap, bfsReachableLandmarks } from './tiled';
import { generateStarterMap } from './starterMapData';

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

  // Acceptance criterion:
  // Test: running the generator reproduces the committed starter.tmj byte for byte.
  it('running the generator reproduces the committed starter.tmj byte for byte', () => {
    const freshGenerated = generateStarterMap();
    const freshJson = JSON.stringify(freshGenerated, null, 2) + '\n';
    const committedContent = readFileSync(mapPath, 'utf-8');

    expect(freshJson).toBe(committedContent);
  });
});
