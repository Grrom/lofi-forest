import { StorageManager, defaultStorageManager } from './StorageManager';
import { gameEvents } from '../engine/events';
import { TILE_SIZE } from '@lofi/shared';

export interface Landmark {
  id: string;
  label: string;
  radius: number;
  x: number;
  y: number;
  tileX?: number;
  tileY?: number;
}

export interface OpenTile {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export const DEFAULT_LANDMARKS: Landmark[] = [
  {
    id: 'forest_clearing',
    label: 'Forest Clearing',
    radius: 64,
    x: 60 * TILE_SIZE, // 960
    y: 32 * TILE_SIZE, // 512
    tileX: 60,
    tileY: 32,
  },
  {
    id: 'lakeside_dock',
    label: 'Lakeside Dock',
    radius: 48,
    x: 4 * TILE_SIZE, // 64
    y: 32 * TILE_SIZE, // 512
    tileX: 4,
    tileY: 32,
  },
  {
    id: 'cozy_pub',
    label: 'Cozy Pub',
    radius: 64,
    x: 115 * TILE_SIZE, // 1840
    y: 17 * TILE_SIZE, // 272
    tileX: 115,
    tileY: 17,
  },
];

/**
 * Pure findOpenTileNear(grid, x, y):
 * The nearest walkable tile next to the point (ring search), never the point's own tile.
 * Searches the next ring when all 8 neighbours are solid, and never returns a solid tile.
 */
export function findOpenTileNear(
  grid: any,
  x: number,
  y: number,
  maxRadius = 100
): OpenTile | null {
  const isSolid = (tx: number, ty: number): boolean => {
    if (!grid) return true;
    if (typeof grid.isSolid === 'function') {
      return grid.isSolid(tx, ty);
    }
    // 2D array representation
    if (Array.isArray(grid)) {
      if (ty < 0 || ty >= grid.length) return true;
      const row = grid[ty];
      if (!Array.isArray(row) || tx < 0 || tx >= row.length) return true;
      return Boolean(row[tx]);
    }
    const width = grid.width;
    const height = grid.height;
    if (typeof width === 'number' && typeof height === 'number') {
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) return true;
      if (grid.collision) {
        return grid.collision[ty * width + tx] > 0;
      }
    }
    if (grid.grid && Array.isArray(grid.grid)) {
      if (ty < 0 || ty >= grid.grid.length) return true;
      const row = grid.grid[ty];
      if (!Array.isArray(row) || tx < 0 || tx >= row.length) return true;
      return Boolean(row[tx]);
    }
    return false;
  };

  const getBounds = (): { width: number; height: number } => {
    if (Array.isArray(grid)) {
      return { width: grid[0]?.length || 0, height: grid.length };
    }
    return {
      width: grid?.width || 128,
      height: grid?.height || 64,
    };
  };

  const bounds = getBounds();
  const maxSearchRadius = Math.min(
    maxRadius,
    Math.max(bounds.width, bounds.height, 1)
  );

  // Ring search: r = 1, 2, 3... (never ring 0 = point's own tile)
  for (let r = 1; r <= maxSearchRadius; r++) {
    const candidates: Array<{ tx: number; ty: number; distSq: number }> = [];

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only consider the boundary of the ring where max(|dx|, |dy|) === r
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

        const tx = x + dx;
        const ty = y + dy;

        if (!isSolid(tx, ty)) {
          candidates.push({
            tx,
            ty,
            distSq: dx * dx + dy * dy,
          });
        }
      }
    }

    if (candidates.length > 0) {
      // Pick nearest candidate by Euclidean distance; tie-break predictably
      candidates.sort((a, b) => {
        if (a.distSq !== b.distSq) return a.distSq - b.distSq;
        if (a.ty !== b.ty) return a.ty - b.ty;
        return a.tx - b.tx;
      });
      const best = candidates[0];
      return {
        x: best.tx,
        y: best.ty,
        tileX: best.tx,
        tileY: best.ty,
      };
    }
  }

  return null;
}

export class FastTravelSystem {
  public landmarks: Landmark[] = [];
  public map?: any;
  public player?: any;
  private storageManager: StorageManager;

  private currentToast: string | null = null;
  private toastExpiresAtMs = 0;
  private toastTimerId: any = null;
  private toastListeners = new Set<(toast: string | null) => void>();

  constructor(
    mapOrLandmarks?: any,
    storageManager: StorageManager = defaultStorageManager
  ) {
    this.storageManager = storageManager;
    if (mapOrLandmarks) {
      this.setMap(mapOrLandmarks);
    } else {
      this.landmarks = [...DEFAULT_LANDMARKS];
    }
  }

  public setMap(mapOrLandmarks: any): void {
    if (Array.isArray(mapOrLandmarks)) {
      this.landmarks = [...mapOrLandmarks];
    } else if (mapOrLandmarks && Array.isArray(mapOrLandmarks.landmarks)) {
      this.map = mapOrLandmarks;
      this.landmarks =
        mapOrLandmarks.landmarks.length > 0
          ? [...mapOrLandmarks.landmarks]
          : [...DEFAULT_LANDMARKS];
    } else {
      this.map = mapOrLandmarks;
      if (this.landmarks.length === 0) {
        this.landmarks = [...DEFAULT_LANDMARKS];
      }
    }
  }

  public setPlayer(player: any): void {
    this.player = player;
  }

  public getUnlockedLandmarks(): string[] {
    return this.storageManager.get().unlockedLandmarks;
  }

  public isUnlocked(landmarkId: string): boolean {
    return this.getUnlockedLandmarks().includes(landmarkId);
  }

  public unlockLandmark(landmarkId: string): boolean {
    const current = this.getUnlockedLandmarks();
    if (current.includes(landmarkId)) {
      return false;
    }
    this.storageManager.update({
      unlockedLandmarks: [...current, landmarkId],
    });
    return true;
  }

  public getActiveToast(): string | null {
    if (this.currentToast && Date.now() < this.toastExpiresAtMs) {
      return this.currentToast;
    }
    return null;
  }

  public get toast(): string | null {
    return this.getActiveToast();
  }

  public showToast(message: string, durationMs = 3000): void {
    this.currentToast = message;
    this.toastExpiresAtMs = Date.now() + durationMs;
    this.notifyToastListeners();

    if (this.toastTimerId) {
      clearTimeout(this.toastTimerId);
      this.toastTimerId = null;
    }

    this.toastTimerId = setTimeout(() => {
      if (Date.now() >= this.toastExpiresAtMs) {
        this.currentToast = null;
        this.notifyToastListeners();
      }
    }, durationMs);

    gameEvents.emit('toast', { message, durationMs });
  }

  public clearToast(): void {
    this.currentToast = null;
    this.toastExpiresAtMs = 0;
    if (this.toastTimerId) {
      clearTimeout(this.toastTimerId);
      this.toastTimerId = null;
    }
    this.notifyToastListeners();
  }

  public subscribeToast(listener: (toast: string | null) => void): () => void {
    this.toastListeners.add(listener);
    listener(this.getActiveToast());
    return () => {
      this.toastListeners.delete(listener);
    };
  }

  private notifyToastListeners(): void {
    const current = this.getActiveToast();
    for (const listener of Array.from(this.toastListeners)) {
      try {
        listener(current);
      } catch (err) {
        console.error('[FastTravelSystem] Toast subscriber error:', err);
      }
    }
  }

  /**
   * Evaluates player position against all landmarks.
   * If entering a locked landmark's radius: unlocks, persists to StorageManager,
   * and displays 'Discovered: <label>' for 3 s.
   * An already-unlocked landmark does nothing.
   */
  public checkPosition(px: number, py: number): Landmark | null {
    const tw = this.map?.tileWidth || TILE_SIZE;
    const th = this.map?.tileHeight || TILE_SIZE;

    for (const lm of this.landmarks) {
      const centerX = lm.x + tw / 2;
      const centerY = lm.y + th / 2;
      const distCenter = Math.hypot(px - centerX, py - centerY);
      const distTopLeft = Math.hypot(px - lm.x, py - lm.y);
      const dist = Math.min(distCenter, distTopLeft);

      if (dist <= lm.radius) {
        if (!this.isUnlocked(lm.id)) {
          this.unlockLandmark(lm.id);
          this.showToast(`Discovered: ${lm.label}`, 3000);
          return lm;
        }
      }
    }

    return null;
  }

  public getLandmark(idOrName: string): Landmark | undefined {
    const norm = idOrName.toLowerCase().trim();
    return (
      this.landmarks.find((l) => l.id.toLowerCase() === norm) ||
      this.landmarks.find((l) => l.label.toLowerCase() === norm) ||
      this.landmarks.find((l) => l.id.toLowerCase().includes(norm)) ||
      this.landmarks.find((l) => l.label.toLowerCase().includes(norm))
    );
  }

  /**
   * Teleports to a landmark by ID or label.
   */
  public teleportToLandmark(
    landmarkId: string,
    options?: { immediate?: boolean; onComplete?: () => void }
  ): Promise<boolean> | boolean {
    const lm = this.getLandmark(landmarkId);
    if (!lm) {
      console.warn(`[FastTravelSystem] Landmark "${landmarkId}" not found.`);
      return false;
    }

    const tw = this.map?.tileWidth || TILE_SIZE;
    const th = this.map?.tileHeight || TILE_SIZE;
    let targetX = lm.x + tw / 2;
    let targetY = lm.y + th / 2;

    const tileX = lm.tileX !== undefined ? lm.tileX : Math.floor(lm.x / tw);
    const tileY = lm.tileY !== undefined ? lm.tileY : Math.floor(lm.y / th);

    if (this.map && typeof this.map.collision !== 'undefined') {
      const isSolid = this.map.collision[tileY * this.map.width + tileX] > 0;
      if (isSolid) {
        const open = findOpenTileNear(this.map, tileX, tileY);
        if (open) {
          targetX = open.tileX * tw + tw / 2;
          targetY = open.tileY * th + th / 2;
        }
      }
    }

    if (this.player && typeof this.player.teleport === 'function') {
      const res = this.player.teleport(targetX, targetY, options);
      if (res && typeof res.then === 'function') {
        return res.then(() => true);
      }
      return true;
    }

    gameEvents.emit('teleported', { x: targetX, y: targetY });
    options?.onComplete?.();
    return true;
  }

  /**
   * Helper exposed as teleportNear(x, y) for teleport-to-friend.
   */
  public teleportNear(
    x: number,
    y: number,
    options?: { immediate?: boolean; onComplete?: () => void }
  ): boolean {
    const tw = this.map?.tileWidth || TILE_SIZE;
    const th = this.map?.tileHeight || TILE_SIZE;
    const tileX = Math.floor(x / tw);
    const tileY = Math.floor(y / th);

    const grid = this.map || { width: 128, height: 64 };
    const open = findOpenTileNear(grid, tileX, tileY);
    if (!open) return false;

    const destX = open.tileX * tw + tw / 2;
    const destY = open.tileY * th + th / 2;

    if (this.player && typeof this.player.teleport === 'function') {
      this.player.teleport(destX, destY, options);
      return true;
    }

    gameEvents.emit('teleported', { x: destX, y: destY });
    options?.onComplete?.();
    return true;
  }
}

export const defaultFastTravelSystem = new FastTravelSystem();

export function teleportNear(
  x: number,
  y: number,
  options?: { immediate?: boolean; onComplete?: () => void }
): boolean {
  return defaultFastTravelSystem.teleportNear(x, y, options);
}
