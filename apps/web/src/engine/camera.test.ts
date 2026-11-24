import { describe, it, expect, beforeEach } from 'vitest';
import { pickZoom, Camera } from './camera';
import { StorageManager } from '../systems/StorageManager';
import { WORLD_WIDTH_PX, WORLD_HEIGHT_PX } from '@lofi/shared';

describe('Camera & pickZoom', () => {
  beforeEach(() => {
    localStorage.clear();
    StorageManager.reset();
  });

  // Acceptance criterion:
  // Test: with empty storage, the camera starts in zoom setting 'auto'.
  it('with empty storage, the camera starts in zoom setting "auto"', () => {
    const cam = new Camera();
    expect(cam.zoomSetting).toBe('auto');
  });

  // Acceptance criterion:
  // Tests for pickZoom: 390×844 → 2, 1280×720 → 3, 2560×1440 → 4.
  it('Tests for pickZoom: 390×844 → 2, 1280×720 → 3, 2560×1440 → 4', () => {
    expect(pickZoom(390, 844)).toBe(2);
    expect(pickZoom(1280, 720)).toBe(3);
    expect(pickZoom(2560, 1440)).toBe(4);
  });

  it('StorageManager zoom pref overrides auto zoom and cycles auto/2/3/4', () => {
    const cam = new Camera();
    cam.updateViewport(1280, 720); // In auto, 1280x720 gives zoom 3
    expect(cam.zoom).toBe(3);
    expect(cam.zoomSetting).toBe('auto');

    // Cycle to 2
    expect(cam.cycleZoom()).toBe(2);
    expect(cam.zoom).toBe(2);
    expect(StorageManager.get().zoom).toBe(2);

    // Cycle to 3
    expect(cam.cycleZoom()).toBe(3);
    expect(cam.zoom).toBe(3);
    expect(StorageManager.get().zoom).toBe(3);

    // Cycle to 4
    expect(cam.cycleZoom()).toBe(4);
    expect(cam.zoom).toBe(4);
    expect(StorageManager.get().zoom).toBe(4);

    // Cycle back to auto
    expect(cam.cycleZoom()).toBe('auto');
    expect(cam.zoomSetting).toBe('auto');
    expect(cam.zoom).toBe(3); // Auto picks 3 for 1280x720
    expect(StorageManager.get().zoom).toBe('auto');
  });

  it('camera is Math.rounded every frame and clamped to the map', () => {
    const cam = new Camera();
    cam.updateViewport(800, 600);
    cam.zoom = 2;

    // Viewport in world pixels: 800 / 2 = 400, 600 / 2 = 300
    // Look at out-of-bounds negative position
    cam.lookAt(-100.3, -50.7);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
    expect(cam.roundedX).toBe(0);
    expect(cam.roundedY).toBe(0);

    // Look at out-of-bounds beyond map bounds
    cam.lookAt(WORLD_WIDTH_PX + 500, WORLD_HEIGHT_PX + 500);
    const maxViewW = 800 / 2;
    const maxViewH = 600 / 2;
    expect(cam.x).toBe(WORLD_WIDTH_PX - maxViewW);
    expect(cam.y).toBe(WORLD_HEIGHT_PX - maxViewH);
    expect(cam.roundedX).toBe(Math.round(WORLD_WIDTH_PX - maxViewW));
    expect(cam.roundedY).toBe(Math.round(WORLD_HEIGHT_PX - maxViewH));

    // Look at arbitrary fractional coordinate
    cam.x = 245.6;
    cam.y = 112.3;
    cam.clamp();
    expect(cam.roundedX).toBe(246);
    expect(cam.roundedY).toBe(112);
  });
});
