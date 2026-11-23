export interface PathPoint {
  tileX: number;
  tileY: number;
}

export interface PathfindingMap {
  width: number;
  height: number;
  collision?: number[] | Uint8Array;
  isSolid?: (tileX: number, tileY: number) => boolean;
}

export function isGridTileSolid(
  map: PathfindingMap,
  tileX: number,
  tileY: number
): boolean {
  if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
    return true;
  }
  if (map.isSolid) {
    return map.isSolid(tileX, tileY);
  }
  if (map.collision) {
    return map.collision[tileY * map.width + tileX] > 0;
  }
  return false;
}

function octileDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

interface Node {
  tileX: number;
  tileY: number;
  g: number;
  h: number;
  f: number;
  parent?: Node;
}

/**
 * 8-directional A* pathfinding on a collision grid with strict corner cutting prevention.
 * Returns the sequence of path tiles from start to goal (inclusive), or null if unreachable.
 */
export function findPath(
  start: PathPoint,
  goal: PathPoint,
  map: PathfindingMap
): PathPoint[] | null {
  // If either start or goal is solid or out of bounds, cannot path
  if (isGridTileSolid(map, start.tileX, start.tileY)) return null;
  if (isGridTileSolid(map, goal.tileX, goal.tileY)) return null;

  if (start.tileX === goal.tileX && start.tileY === goal.tileY) {
    return [{ tileX: start.tileX, tileY: start.tileY }];
  }

  const { width, height } = map;
  const gScores = new Float64Array(width * height);
  gScores.fill(Infinity);

  const closedSet = new Uint8Array(width * height);

  // Priority queue (open list)
  const openList: Node[] = [];

  const startH = octileDistance(
    start.tileX,
    start.tileY,
    goal.tileX,
    goal.tileY
  );
  const startNode: Node = {
    tileX: start.tileX,
    tileY: start.tileY,
    g: 0,
    h: startH,
    f: startH,
  };

  gScores[start.tileY * width + start.tileX] = 0;
  openList.push(startNode);

  // Directions: 4 cardinals, then 4 diagonals
  const directions: Array<{ dx: number; dy: number; cost: number; isDiag: boolean }> = [
    { dx: 0, dy: -1, cost: 1, isDiag: false },
    { dx: 0, dy: 1, cost: 1, isDiag: false },
    { dx: -1, dy: 0, cost: 1, isDiag: false },
    { dx: 1, dy: 0, cost: 1, isDiag: false },
    { dx: -1, dy: -1, cost: Math.SQRT2, isDiag: true },
    { dx: 1, dy: -1, cost: Math.SQRT2, isDiag: true },
    { dx: -1, dy: 1, cost: Math.SQRT2, isDiag: true },
    { dx: 1, dy: 1, cost: Math.SQRT2, isDiag: true },
  ];

  while (openList.length > 0) {
    // Pop lowest f score
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (
        openList[i].f < openList[lowestIdx].f ||
        (openList[i].f === openList[lowestIdx].f &&
          openList[i].h < openList[lowestIdx].h)
      ) {
        lowestIdx = i;
      }
    }

    const current = openList.splice(lowestIdx, 1)[0];
    const curIdx = current.tileY * width + current.tileX;

    // Goal reached?
    if (current.tileX === goal.tileX && current.tileY === goal.tileY) {
      const path: PathPoint[] = [];
      let curr: Node | undefined = current;
      while (curr) {
        path.push({ tileX: curr.tileX, tileY: curr.tileY });
        curr = curr.parent;
      }
      path.reverse();
      return path;
    }

    closedSet[curIdx] = 1;

    for (const dir of directions) {
      const nx = current.tileX + dir.dx;
      const ny = current.tileY + dir.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nIdx = ny * width + nx;
      if (closedSet[nIdx]) continue;
      if (isGridTileSolid(map, nx, ny)) continue;

      // No corner cutting:
      // For diagonal moves, BOTH adjacent orthogonal tiles must be non-solid!
      if (dir.isDiag) {
        if (
          isGridTileSolid(map, current.tileX + dir.dx, current.tileY) ||
          isGridTileSolid(map, current.tileX, current.tileY + dir.dy)
        ) {
          continue; // Diagonal move would cut a solid corner
        }
      }

      const tentativeG = current.g + dir.cost;
      if (tentativeG < gScores[nIdx]) {
        gScores[nIdx] = tentativeG;
        const h = octileDistance(nx, ny, goal.tileX, goal.tileY);
        const neighborNode: Node = {
          tileX: nx,
          tileY: ny,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };

        const existingIdx = openList.findIndex(
          (n) => n.tileX === nx && n.tileY === ny
        );
        if (existingIdx !== -1) {
          openList[existingIdx] = neighborNode;
        } else {
          openList.push(neighborNode);
        }
      }
    }
  }

  return null;
}
