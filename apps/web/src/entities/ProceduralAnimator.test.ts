import { describe, it, expect } from 'vitest';
import { sample, ProceduralAnimator } from './ProceduralAnimator';

describe('ProceduralAnimator', () => {
  // Acceptance criterion:
  // Tests (animator): idle scaleY stays within [0.98, 1.02] over 10 s of samples; vibe rotation stays within ±0.06; celebrate is neutral (offsetY=0) at t ≥ 3000 ms.

  it('idle scaleY stays within [0.98, 1.02] over 10 s of samples', () => {
    // Sample every 10 ms across 10 seconds (10 000 ms)
    for (let t = 0; t <= 10000; t += 10) {
      const s = sample('idle', t);
      expect(s.scaleY).toBeGreaterThanOrEqual(0.98);
      expect(s.scaleY).toBeLessThanOrEqual(1.02);
      expect(s.offsetY).toBe(0);
      expect(s.rotation).toBe(0);
    }
  });

  it('vibe rotation stays within ±0.06', () => {
    // Sample every 10 ms across 10 seconds
    for (let t = 0; t <= 10000; t += 10) {
      const s = sample('vibe', t);
      expect(s.rotation).toBeGreaterThanOrEqual(-0.06);
      expect(s.rotation).toBeLessThanOrEqual(0.06);
    }
  });

  it('celebrate is neutral (offsetY=0) at t >= 3000 ms', () => {
    // Before 3000 ms, celebrate should have bounce arcs with non-zero offsetY during flight
    const inFlightSample = sample('celebrate', 350); // midpoint of first 700ms jump
    expect(inFlightSample.offsetY).toBeLessThan(0);

    // At and after 3000 ms, celebrate must be neutral (offsetY=0, scale=1, rotation=0)
    const testTimes = [3000, 3001, 3500, 4000, 10000];
    for (const t of testTimes) {
      const s = sample('celebrate', t);
      expect(s.offsetY).toBe(0);
      expect(s.scaleX).toBe(1);
      expect(s.scaleY).toBe(1);
      expect(s.rotation).toBe(0);
    }
  });

  it('ProceduralAnimator static helper delegates to sample()', () => {
    const s1 = ProceduralAnimator.sample('walk', 150);
    const s2 = sample('walk', 150);
    expect(s1).toEqual(s2);
    expect(s1.offsetY).toBeLessThan(0); // walk hops
  });

  it('sit and sleep provide expected breathing and squish', () => {
    const sitSample = sample('sit', 600);
    expect(sitSample.offsetY).toBe(0);
    expect(sitSample.rotation).toBe(0);

    const sleepSample = sample('sleep', 500);
    expect(sleepSample.scaleY).toBeLessThan(1.0);
    expect(sleepSample.scaleX).toBeGreaterThan(1.0);
    expect(sleepSample.offsetY).toBe(1);
  });
});
