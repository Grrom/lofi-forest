import { describe, it, expect } from 'vitest';
import { findPath, type PathfindingMap } from './pathfinding';

describe('pathfinding system (A*)', () => {
  // Acceptance criterion:
  // Tests (pathfinding): shortest path on a small grid; null when unreachable; never cuts a corner between diagonal solid tiles.
  describe('Acceptance Criteria: shortest path on a small grid; null when unreachable; never cuts a corner between diagonal solid tiles', () => {
    it('finds the shortest path on a small grid', () => {
      // 5x5 open grid
      const width = 5;
      const height = 5;
      const collision = new Array(width * height).fill(0);
      const map: PathfindingMap = { width, height, collision };

      // 1. Straight path along cardinal axis
      const straightPath = findPath({ tileX: 0, tileY: 0 }, { tileX: 0, tileY: 3 }, map);
      expect(straightPath).not.toBeNull();
      expect(straightPath).toEqual([
        { tileX: 0, tileY: 0 },
        { tileX: 0, tileY: 1 },
        { tileX: 0, tileY: 2 },
        { tileX: 0, tileY: 3 },
      ]);

      // 2. Diagonal shortest path
      const diagPath = findPath({ tileX: 1, tileY: 1 }, { tileX: 3, tileY: 3 }, map);
      expect(diagPath).not.toBeNull();
      expect(diagPath).toEqual([
        { tileX: 1, tileY: 1 },
        { tileX: 2, tileY: 2 },
        { tileX: 3, tileY: 3 },
      ]);
    });

    it('returns null when unreachable', () => {
      const width = 5;
      const height = 5;
      // Completely enclose (4, 4) with walls
      const map: PathfindingMap = {
        width,
        height,
        collision: [
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 0, 0,
          0, 0, 0, 1, 1,
          0, 0, 0, 1, 0, // (4, 4) enclosed by solid (3, 3), (4, 3), (3, 4)
        ],
      };

      const path = findPath({ tileX: 0, tileY: 0 }, { tileX: 4, tileY: 4 }, map);
      expect(path).toBeNull();

      // Goal is itself a solid tile
      const solidGoalPath = findPath({ tileX: 0, tileY: 0 }, { tileX: 3, tileY: 3 }, map);
      expect(solidGoalPath).toBeNull();
    });

    it('never cuts a corner between diagonal solid tiles', () => {
      // 2x2 grid where (1, 0) and (0, 1) are solid:
      // [ S, 1 ]
      // [ 1, G ]
      // Moving diagonally from (0, 0) to (1, 1) would squeeze between two touching corners.
      // With no corner cutting, (1, 1) MUST be unreachable and return null.
      const mapDiagonalTouching: PathfindingMap = {
        width: 2,
        height: 2,
        collision: [
          0, 1,
          1, 0,
        ],
      };

      const pathTouching = findPath(
        { tileX: 0, tileY: 0 },
        { tileX: 1, tileY: 1 },
        mapDiagonalTouching
      );
      expect(pathTouching).toBeNull();

      // In a 3x3 grid where diagonal move would cut a single solid corner:
      // [ S, 1, . ]
      // [ ., ., G ]
      // (1, 0) is solid. Direct diagonal (0, 0) -> (1, 1) must be blocked because (1, 0) is solid.
      // The path must go around via (0, 1): (0, 0) -> (0, 1) -> (1, 1) or (0, 1) -> (2, 2)
      const mapSingleCorner: PathfindingMap = {
        width: 3,
        height: 3,
        collision: [
          0, 1, 0,
          0, 0, 0,
          0, 0, 0,
        ],
      };

      const pathAround = findPath(
        { tileX: 0, tileY: 0 },
        { tileX: 2, tileY: 0 },
        mapSingleCorner
      );
      expect(pathAround).not.toBeNull();
      // Verify that (1, 0) is not in the path and no diagonal cut through (1, 0) occurred
      for (const step of pathAround!) {
        expect(step).not.toEqual({ tileX: 1, tileY: 0 });
      }
      // First step from (0, 0) cannot be (1, 1) because (1, 0) is solid!
      expect(pathAround![1]).toEqual({ tileX: 0, tileY: 1 });
    });
  });
});
