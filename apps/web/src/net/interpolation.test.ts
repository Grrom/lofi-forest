import { describe, it, expect } from 'vitest';
import { InterpolationBuffer } from './interpolation';
import { INTERP_DELAY_MS, TELEPORT_SNAP_PX } from '@lofi/shared';

describe('InterpolationBuffer', () => {
  // Acceptance criterion:
  // Tests (interpolation): snapshots t=0 x=0 and t=100 x=100, sample(190) → x=50; a jump to x=500 snaps; with no newer snapshot, the last position is held.
  it('snapshots t=0 x=0 and t=100 x=100, sample(190) → x=50; a jump to x=500 snaps; with no newer snapshot, the last position is held', () => {
    const buffer = new InterpolationBuffer();
    buffer.push({ t: 0, x: 0, y: 0 });
    buffer.push({ t: 100, x: 100, y: 0 });

    // INTERP_DELAY_MS is 140 ms, so at nowMs = 190, renderTime = 190 - 140 = 50 ms.
    // Halfway between t=0 (x=0) and t=100 (x=100) -> x=50
    const sampleMid = buffer.sample(190);
    expect(sampleMid).not.toBeNull();
    expect(sampleMid!.x).toBe(50);

    // A jump to x=500 snaps (distance 400 > TELEPORT_SNAP_PX = 128)
    buffer.push({ t: 200, x: 500, y: 0 });

    // At nowMs = 290, renderTime = 290 - 140 = 150 ms (between 100 and 200).
    // Because distance between consecutive snapshots > 128 px, it snaps to 500 rather than interpolating to 300.
    const sampleJump = buffer.sample(290);
    expect(sampleJump).not.toBeNull();
    expect(sampleJump!.x).toBe(500);

    // With no newer snapshot, the last position is held
    // At nowMs = 400, renderTime = 260 ms (> 200 ms).
    const sampleHeld = buffer.sample(400);
    expect(sampleHeld).not.toBeNull();
    expect(sampleHeld!.x).toBe(500);
  });

  it('returns null when buffer is empty', () => {
    const buffer = new InterpolationBuffer();
    expect(buffer.sample(100)).toBeNull();
  });

  it('holds first position when sampled before first snapshot', () => {
    const buffer = new InterpolationBuffer();
    buffer.push({ t: 100, x: 20, y: 30 });
    // nowMs = 200 -> renderTime = 60 (< 100)
    const pos = buffer.sample(200);
    expect(pos).toEqual({ x: 20, y: 30 });
  });

  it('interpolates in 2D with y coordinates', () => {
    const buffer = new InterpolationBuffer();
    buffer.push({ t: 0, x: 0, y: 0 });
    buffer.push({ t: 100, x: 100, y: 200 });

    // renderTime = 190 - 140 = 50 ms (alpha = 0.5)
    // Distance = hypot(100, 200) = ~223 > 128 -> snaps!
    const snapped = buffer.sample(190);
    expect(snapped).toEqual({ x: 100, y: 200 });

    // Within snap limit: dx=60, dy=80 -> dist=100 <= 128
    const smallBuffer = new InterpolationBuffer();
    smallBuffer.push({ t: 0, x: 0, y: 0 });
    smallBuffer.push({ t: 100, x: 60, y: 80 });
    const interpolated = smallBuffer.sample(190);
    expect(interpolated).toEqual({ x: 30, y: 40 });
  });

  it('supports clear() and add() alias', () => {
    const buffer = new InterpolationBuffer();
    buffer.add({ t: 0, x: 10, y: 10 });
    expect(buffer.length).toBe(1);
    buffer.clear();
    expect(buffer.length).toBe(0);
    expect(buffer.sample(100)).toBeNull();
  });
});
