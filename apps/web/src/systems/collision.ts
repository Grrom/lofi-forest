import { TILE_SIZE } from '@lofi/shared';

export const PLAYER_COLLISION_RADIUS = 5;

export interface CollisionMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  collision: number[] | Uint8Array;
}

/**
 * Checks if a tile coordinate is solid or out of map bounds.
 */
export function isTileSolid(
  map: CollisionMap,
  tileX: number,
  tileY: number
): boolean {
  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
    return true;
  }
  return map.collision[tileY * map.width + tileX] > 0;
}

/**
 * Checks if a circle overlaps an axis-aligned bounding box (AABB).
 */
export function circleAABBOverlap(
  cx: number,
  cy: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): boolean {
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestY = Math.max(minY, Math.min(cy, maxY));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

/**
 * Checks if a circle at (x, y) with given radius collides with any solid tile or world boundary.
 */
export function checkCollision(
  x: number,
  y: number,
  radius: number,
  map: CollisionMap
): boolean {
  const worldW = map.width * map.tileWidth;
  const worldH = map.height * map.tileHeight;

  // World boundaries
  if (
    x - radius < 0 ||
    x + radius > worldW ||
    y - radius < 0 ||
    y + radius > worldH
  ) {
    return true;
  }

  const minTileX = Math.max(0, Math.floor((x - radius) / map.tileWidth));
  const maxTileX = Math.min(
    map.width - 1,
    Math.floor((x + radius) / map.tileWidth)
  );
  const minTileY = Math.max(0, Math.floor((y - radius) / map.tileHeight));
  const maxTileY = Math.min(
    map.height - 1,
    Math.floor((y + radius) / map.tileHeight)
  );

  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      if (isTileSolid(map, tx, ty)) {
        const minX = tx * map.tileWidth;
        const minY = ty * map.tileHeight;
        const maxX = minX + map.tileWidth;
        const maxY = minY + map.tileHeight;
        if (circleAABBOverlap(x, y, radius, minX, minY, maxX, maxY)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Moves position by (dx, dy) with axis-separated wall sliding.
 * Axis separation ensures that colliding with a wall along one axis allows
 * sliding freely along the orthogonal axis.
 * Returns the resolved position { x, y } which is guaranteed never to overlap a solid tile.
 */
export function moveWithCollision(
  pos: { x: number; y: number },
  dx: number,
  dy: number,
  map: CollisionMap,
  radius = PLAYER_COLLISION_RADIUS
): { x: number; y: number } {
  let currX = pos.x;
  let currY = pos.y;

  // 1. Move along X axis
  if (dx !== 0) {
    const targetX = currX + dx;
    if (!checkCollision(targetX, currY, radius, map)) {
      currX = targetX;
    } else {
      let low = 0;
      let high = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (low + high) / 2;
        if (!checkCollision(currX + dx * mid, currY, radius, map)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      currX = currX + dx * low;
    }
  }

  // 2. Move along Y axis
  if (dy !== 0) {
    const targetY = currY + dy;
    if (!checkCollision(currX, targetY, radius, map)) {
      currY = targetY;
    } else {
      let low = 0;
      let high = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (low + high) / 2;
        if (!checkCollision(currX, currY + dy * mid, radius, map)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      currY = currY + dy * low;
    }
  }

  return { x: currX, y: currY };
}
