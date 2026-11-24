import { describe, it, expect } from 'vitest';
import {
  moveWithCollision,
  checkCollision,
  circleAABBOverlap,
  isTileSolid,
  type CollisionMap,
  PLAYER_COLLISION_RADIUS,
} from './collision';

describe('collision system', () => {
  // Acceptance criterion:
  // Tests (collision): moving diagonally into a vertical wall keeps the vertical component; the player never ends up overlapping a solid tile.
  it('moving diagonally into a vertical wall keeps the vertical component; the player never ends up overlapping a solid tile', () => {
    // 4x4 tile map (each tile 16x16 px)
    // Vertical wall at tileX = 2 (x = 32..48) for tileY = 0..3
    const width = 4;
    const height = 4;
    const tileWidth = 16;
    const tileHeight = 16;
    const collision = new Array(width * height).fill(0);

    for (let ty = 0; ty < height; ty++) {
      collision[ty * width + 2] = 1; // Vertical solid wall at x = 32
    }

    const map: CollisionMap = {
      width,
      height,
      tileWidth,
      tileHeight,
      collision,
    };

    // Radius is 5.
    // Start at x = 20, y = 20. Circle right edge is at 25 < 32. Not colliding.
    const startPos = { x: 20, y: 20 };
    expect(checkCollision(startPos.x, startPos.y, PLAYER_COLLISION_RADIUS, map)).toBe(false);

    // Try moving diagonally right-down: dx = +15, dy = +10
    // Unconstrained target would be x = 35 (inside wall!), y = 30.
    const result = moveWithCollision(startPos, 15, 10, map);

    // 1. The vertical component is kept: y must have increased by full dy = 10 (from 20 to 30)
    expect(result.y).toBe(30);

    // 2. The player must stop at or before wall boundary (32 - 5 = 27)
    expect(result.x).toBeLessThanOrEqual(27.001);
    expect(result.x).toBeGreaterThan(startPos.x);

    // 3. The player NEVER ends up overlapping a solid tile
    expect(checkCollision(result.x, result.y, PLAYER_COLLISION_RADIUS, map)).toBe(false);
  });

  it('moving diagonally into a horizontal wall keeps the horizontal component without overlapping', () => {
    // Horizontal wall at tileY = 2 (y = 32..48)
    const width = 4;
    const height = 4;
    const map: CollisionMap = {
      width,
      height,
      tileWidth: 16,
      tileHeight: 16,
      collision: [
        0, 0, 0, 0,
        0, 0, 0, 0,
        1, 1, 1, 1,
        0, 0, 0, 0,
      ],
    };

    const startPos = { x: 10, y: 20 };
    // Move dx = +12, dy = +15 (down into horizontal wall)
    const result = moveWithCollision(startPos, 12, 15, map);

    // Horizontal component kept
    expect(result.x).toBe(22);
    // Vertical stops before y = 32 - 5 = 27
    expect(result.y).toBeLessThanOrEqual(27.001);
    expect(checkCollision(result.x, result.y, PLAYER_COLLISION_RADIUS, map)).toBe(false);
  });

  it('moving into an internal corner stops both axes at boundaries without overlapping', () => {
    // Corner at tileX=2, tileY=2 with walls at X=2 and Y=2
    const width = 4;
    const height = 4;
    const collision = new Array(width * height).fill(0);
    for (let ty = 0; ty < height; ty++) collision[ty * width + 2] = 1;
    for (let tx = 0; tx < width; tx++) collision[2 * width + tx] = 1;

    const map: CollisionMap = {
      width,
      height,
      tileWidth: 16,
      tileHeight: 16,
      collision,
    };

    const startPos = { x: 20, y: 20 };
    const result = moveWithCollision(startPos, 15, 15, map);

    expect(result.x).toBeLessThanOrEqual(27.001);
    expect(result.y).toBeLessThanOrEqual(27.001);
    expect(checkCollision(result.x, result.y, PLAYER_COLLISION_RADIUS, map)).toBe(false);
  });
});
