import {
  TILE_SIZE,
  WORLD_WIDTH_PX,
  WORLD_HEIGHT_PX,
} from '@lofi/shared';
import { StorageManager, type ZoomSetting } from './storage';

export type ZoomLevel = 2 | 3 | 4;

/**
 * Pure function: picks the largest zoom (4, 3, or 2) that shows at least 24×14 tiles,
 * falling back to 2.
 *
 * 24 tiles = 24 * 16 = 384 px.
 * 14 tiles = 14 * 16 = 224 px.
 * For a viewport of (W, H) at integer zoom Z, the visible world space is (W / Z, H / Z).
 * To show at least 24×14 tiles:
 *   W / (16 * Z) >= 24  ==> W >= 384 * Z
 *   H / (16 * Z) >= 14  ==> H >= 224 * Z
 */
export function pickZoom(viewportW: number, viewportH: number): ZoomLevel {
  const minTileW = 24 * TILE_SIZE; // 384
  const minTileH = 14 * TILE_SIZE; // 224

  for (const z of [4, 3, 2] as const) {
    if (viewportW >= minTileW * z && viewportH >= minTileH * z) {
      return z;
    }
  }
  return 2;
}

export class Camera {
  public x = 0;
  public y = 0;
  public zoom: ZoomLevel = 2;
  public zoomSetting: ZoomSetting = 'auto';
  public viewportW = 0;
  public viewportH = 0;

  constructor() {
    this.zoomSetting = StorageManager.getZoom();
  }

  public updateViewport(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
    this.recalculateZoom();
    this.clamp();
  }

  public setZoomSetting(setting: ZoomSetting): void {
    this.zoomSetting = setting;
    StorageManager.setZoom(setting);
    this.recalculateZoom();
    this.clamp();
  }

  public cycleZoom(): ZoomSetting {
    const cycle: ZoomSetting[] = ['auto', 2, 3, 4];
    const currentIndex = cycle.indexOf(this.zoomSetting);
    const nextSetting = cycle[(currentIndex + 1) % cycle.length];
    this.setZoomSetting(nextSetting);
    return nextSetting;
  }

  public recalculateZoom(): void {
    if (this.zoomSetting === 'auto') {
      this.zoom = pickZoom(this.viewportW, this.viewportH);
    } else {
      this.zoom = this.zoomSetting;
    }
  }

  public lookAt(targetX: number, targetY: number): void {
    const viewW = this.viewportW / this.zoom;
    const viewH = this.viewportH / this.zoom;
    this.x = targetX - viewW / 2;
    this.y = targetY - viewH / 2;
    this.clamp();
  }

  public clamp(): void {
    const viewW = this.viewportW / this.zoom;
    const viewH = this.viewportH / this.zoom;

    if (viewW >= WORLD_WIDTH_PX) {
      this.x = (WORLD_WIDTH_PX - viewW) / 2;
    } else {
      this.x = Math.max(0, Math.min(this.x, WORLD_WIDTH_PX - viewW));
    }

    if (viewH >= WORLD_HEIGHT_PX) {
      this.y = (WORLD_HEIGHT_PX - viewH) / 2;
    } else {
      this.y = Math.max(0, Math.min(this.y, WORLD_HEIGHT_PX - viewH));
    }
  }

  /**
   * Integer rounded X coordinate for zero-subpixel artifact rendering.
   */
  public get roundedX(): number {
    return Math.round(this.x);
  }

  /**
   * Integer rounded Y coordinate for zero-subpixel artifact rendering.
   */
  public get roundedY(): number {
    return Math.round(this.y);
  }
}
