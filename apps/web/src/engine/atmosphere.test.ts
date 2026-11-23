import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { Atmosphere } from './atmosphere';
import { Camera } from './camera';

describe('Atmosphere', () => {
  it('campfire radial glow has sine flicker and pulseGlow boost over ~1.5 s', () => {
    const layer = new Container();
    const atmosphere = new Atmosphere(layer, [
      { id: 1, name: 'campfire', x: 100, y: 100, tileX: 6, tileY: 6 },
    ]);

    const baseTime = 100000;
    const baseGlow = atmosphere.getCampfireGlowBoost(baseTime);
    expect(baseGlow.scale).toBeGreaterThan(0.8);
    expect(baseGlow.scale).toBeLessThan(1.2);

    // Trigger pulse glow
    atmosphere.pulseGlow(baseTime);

    // Mid-pulse at 750 ms (peak of ~1.5 s sine pulse)
    const midPulseGlow = atmosphere.getCampfireGlowBoost(baseTime + 750);
    expect(midPulseGlow.scale).toBeGreaterThan(baseGlow.scale);

    // After 1500 ms, pulse ends and returns to base flicker range
    const postPulseGlow = atmosphere.getCampfireGlowBoost(baseTime + 1600);
    expect(postPulseGlow.scale).toBeLessThan(midPulseGlow.scale);
  });

  it('rain is active while camera is in lake and responds to setWeather', () => {
    const layer = new Container();
    const atmosphere = new Atmosphere(layer);

    atmosphere.setZone('forest');
    expect(atmosphere.isRaining()).toBe(false);

    atmosphere.setZone('lake');
    expect(atmosphere.isRaining()).toBe(true);

    atmosphere.setWeather('clear');
    expect(atmosphere.isRaining()).toBe(false);

    atmosphere.setWeather('rain');
    atmosphere.setZone('forest');
    expect(atmosphere.isRaining()).toBe(true);
  });

  it('setVignette fades over 800 ms based on wall-clock time', () => {
    const layer = new Container();
    const atmosphere = new Atmosphere(layer);

    const startTime = 50000;
    expect(atmosphere.getVignetteAlpha(startTime)).toBe(0);

    // Start fade-in
    atmosphere.setVignette(true, startTime);

    // At 400 ms (halfway)
    const midAlpha = atmosphere.getVignetteAlpha(startTime + 400);
    expect(midAlpha).toBeGreaterThan(0.2);
    expect(midAlpha).toBeLessThan(0.8);

    // At 800 ms (completed)
    const fullAlpha = atmosphere.getVignetteAlpha(startTime + 800);
    expect(fullAlpha).toBe(1.0);

    // Fade out
    atmosphere.setVignette(false, startTime + 1000);
    const fadeOutMid = atmosphere.getVignetteAlpha(startTime + 1400);
    expect(fadeOutMid).toBeGreaterThan(0.1);
    expect(fadeOutMid).toBeLessThan(0.9);

    const fadeOutEnd = atmosphere.getVignetteAlpha(startTime + 1800);
    expect(fadeOutEnd).toBe(0.0);
  });
});
