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

class BinaryHeap {
  private heap: Node[] = [];
  private nodeIndices: Int32Array;

  constructor(size: number) {
    this.nodeIndices = new Int32Array(size).fill(-1);
  }

  get size(): number {
    return this.heap.length;
  }

  push(node: Node, mapWidth: number): void {
    const idx = this.heap.length;
    this.heap.push(node);
    this.nodeIndices[node.tileY * mapWidth + node.tileX] = idx;
    this.bubbleUp(idx, mapWidth);
  }

  pop(mapWidth: number): Node {
    const top = this.heap[0];
    this.nodeIndices[top.tileY * mapWidth + top.tileX] = -1;
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.nodeIndices[bottom.tileY * mapWidth + bottom.tileX] = 0;
      this.sinkDown(0, mapWidth);
    }
    return top;
  }

  update(node: Node, mapWidth: number): void {
    const idx = this.nodeIndices[node.tileY * mapWidth + node.tileX];
    if (idx !== -1) {
      this.heap[idx] = node;
      this.bubbleUp(idx, mapWidth);
    }
  }

  isOpen(tileX: number, tileY: number, mapWidth: number): boolean {
    return this.nodeIndices[tileY * mapWidth + tileX] !== -1;
  }

  private bubbleUp(idx: number, mapWidth: number): void {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const current = this.heap[idx];
      const parent = this.heap[parentIdx];
      if (
        current.f < parent.f ||
        (current.f === parent.f && current.h < parent.h)
      ) {
        this.heap[idx] = parent;
        this.heap[parentIdx] = current;
        this.nodeIndices[parent.tileY * mapWidth + parent.tileX] = idx;
        this.nodeIndices[current.tileY * mapWidth + current.tileX] = parentIdx;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private sinkDown(idx: number, mapWidth: number): void {
    const length = this.heap.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;

      if (left < length) {
        const leftNode = this.heap[left];
        const smallestNode = this.heap[smallest];
        if (
          leftNode.f < smallestNode.f ||
          (leftNode.f === smallestNode.f && leftNode.h < smallestNode.h)
        ) {
          smallest = left;
        }
      }

      if (right < length) {
        const rightNode = this.heap[right];
        const smallestNode = this.heap[smallest];
        if (
          rightNode.f < smallestNode.f ||
          (rightNode.f === smallestNode.f && rightNode.h < smallestNode.h)
        ) {
          smallest = right;
        }
      }

      if (smallest !== idx) {
        const current = this.heap[idx];
        const next = this.heap[smallest];
        this.heap[idx] = next;
        this.heap[smallest] = current;
        this.nodeIndices[next.tileY * mapWidth + next.tileX] = idx;
        this.nodeIndices[current.tileY * mapWidth + current.tileX] = smallest;
        idx = smallest;
      } else {
        break;
      }
    }
  }
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

  // Priority queue (binary min-heap with O(1) index map)
  const heap = new BinaryHeap(width * height);

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
  heap.push(startNode, width);

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

  while (heap.size > 0) {
    const current = heap.pop(width);
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

        if (heap.isOpen(nx, ny, width)) {
          heap.update(neighborNode, width);
        } else {
          heap.push(neighborNode, width);
        }
      }
    }
  }

  return null;
}
