import {
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import type { ZoneId } from '@lofi/shared';
import { WORLD_WIDTH_PX, WORLD_HEIGHT_PX } from '@lofi/shared';
import { createProceduralTexture } from './assets/placeholders';
import type { Camera } from './camera';
import type { ParsedCampfire } from './tiled';

export type WeatherType = 'auto' | 'clear' | 'rain';

export interface RainParticle {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
}

export class Atmosphere {
  public weather: WeatherType = 'auto';
  public currentZone: ZoneId = 'forest';

  // Pulse glow state (~1.5s boost)
  private pulseStartTimeMs = 0;
  private readonly PULSE_DURATION_MS = 1500;

  // Vignette state (fading over 800 ms)
  private vignetteOn = false;
  private vignetteAlpha = 0;
  private vignetteFadeStartAlpha = 0;
  private vignetteFadeStartTimeMs = 0;
  private readonly VIGNETTE_DURATION_MS = 800;

  // Pixi containers & objects
  private container: Container;
  private campfireGlows: Sprite[] = [];
  private rainGraphics: Graphics;
  private eveningOverlay: Graphics;
  private vignetteGraphics: Graphics;

  // Rain particles pool
  private rainParticles: RainParticle[] = [];
  private readonly MAX_RAIN_PARTICLES = 120;

  constructor(atmosphereLayer: Container, campfires: ParsedCampfire[] = []) {
    this.container = atmosphereLayer;

    // 1. Additive radial glow on each campfire
    const glowTexture = this.createCampfireGlowTexture();
    for (const campfire of campfires) {
      const glowSprite = new Sprite(glowTexture);
      glowSprite.anchor.set(0.5, 0.5);
      glowSprite.x = campfire.x + 8;
      glowSprite.y = campfire.y + 8;
      glowSprite.blendMode = 'add';
      glowSprite.alpha = 0.8;
      this.campfireGlows.push(glowSprite);
      this.container.addChild(glowSprite);
    }

    // 2. Evening color overlay covering the map bounds
    this.eveningOverlay = new Graphics();
    this.eveningOverlay.rect(0, 0, WORLD_WIDTH_PX, WORLD_HEIGHT_PX);
    // Subtle evening tint (deep twilight navy / dusky amber)
    this.eveningOverlay.fill({ color: 0x1f1738, alpha: 0.22 });
    this.container.addChild(this.eveningOverlay);

    // 3. Rain particles
    this.rainGraphics = new Graphics();
    this.container.addChild(this.rainGraphics);
    this.initRainParticles();

    // 4. Vignette overlay
    this.vignetteGraphics = new Graphics();
    this.vignetteGraphics.alpha = 0;
    this.container.addChild(this.vignetteGraphics);
  }

  private createCampfireGlowTexture(): Texture {
    const size = 64;
    const radius = 30;
    const center = 31.5;

    return createProceduralTexture(size, size, (x, y) => {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);
      if (dist >= radius) {
        return [0, 0, 0, 0];
      }
      const norm = 1 - dist / radius;
      // Soft radial falloff
      const intensity = Math.pow(norm, 1.8);
      const r = 255;
      const g = Math.round(140 + 60 * intensity);
      const b = 30;
      const a = Math.round(255 * intensity);
      return [r, g, b, a];
    });
  }

  private initRainParticles(): void {
    for (let i = 0; i < this.MAX_RAIN_PARTICLES; i++) {
      this.rainParticles.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        length: 8 + Math.random() * 6,
        speed: 350 + Math.random() * 150,
        alpha: 0.4 + Math.random() * 0.4,
      });
    }
  }

  public setWeather(weather: WeatherType): void {
    this.weather = weather;
  }

  public setZone(zone: ZoneId): void {
    this.currentZone = zone;
  }

  /**
   * Triggers a campfire glow boost of ~1.5 s.
   */
  public pulseGlow(nowMs = Date.now()): void {
    this.pulseStartTimeMs = nowMs;
  }

  /**
   * Toggles vignette on/off, fading smoothly over 800 ms.
   */
  public setVignette(on: boolean, nowMs = Date.now()): void {
    if (this.vignetteOn === on) return;
    this.vignetteFadeStartAlpha = this.getVignetteAlpha(nowMs);
    this.vignetteAlpha = this.vignetteFadeStartAlpha;
    this.vignetteOn = on;
    this.vignetteFadeStartTimeMs = nowMs;
  }

  public isRaining(): boolean {
    if (this.weather === 'rain') return true;
    if (this.weather === 'clear') return false;
    // Auto: active while camera is in lake
    return this.currentZone === 'lake';
  }

  public getCampfireGlowBoost(nowMs = Date.now()): {
    scale: number;
    alpha: number;
  } {
    // Wall-clock sine flicker
    const flicker =
      Math.sin(nowMs * 0.007) * 0.08 + Math.sin(nowMs * 0.017) * 0.04;

    // Pulse boost (~1.5 s boost)
    let pulseBoost = 0;
    const pulseElapsed = nowMs - this.pulseStartTimeMs;
    if (pulseElapsed >= 0 && pulseElapsed < this.PULSE_DURATION_MS) {
      const progress = pulseElapsed / this.PULSE_DURATION_MS;
      pulseBoost = Math.sin(progress * Math.PI) * 0.55;
    }

    const scale = 1.0 + flicker + pulseBoost;
    const alpha = Math.min(1.0, 0.75 + flicker * 0.5 + pulseBoost * 0.35);

    return { scale, alpha };
  }

  public getVignetteAlpha(nowMs = Date.now()): number {
    const targetAlpha = this.vignetteOn ? 1.0 : 0.0;
    const elapsed = nowMs - this.vignetteFadeStartTimeMs;
    if (elapsed >= this.VIGNETTE_DURATION_MS) {
      return targetAlpha;
    }
    const t = Math.max(0, elapsed / this.VIGNETTE_DURATION_MS);
    // Smoothstep transition
    const smoothT = t * t * (3 - 2 * t);
    return (
      this.vignetteFadeStartAlpha +
      (targetAlpha - this.vignetteFadeStartAlpha) * smoothT
    );
  }

  public update(camera: Camera, nowMs = Date.now()): void {
    // 1. Update Campfire glow flicker and pulse
    const { scale, alpha } = this.getCampfireGlowBoost(nowMs);
    for (const glow of this.campfireGlows) {
      glow.scale.set(scale);
      glow.alpha = alpha;
    }

    // 2. Update Vignette fade over 800 ms
    this.vignetteAlpha = this.getVignetteAlpha(nowMs);
    this.vignetteGraphics.alpha = this.vignetteAlpha;

    const viewW = camera.viewportW / camera.zoom;
    const viewH = camera.viewportH / camera.zoom;
    const camX = camera.roundedX;
    const camY = camera.roundedY;

    if (this.vignetteAlpha > 0.01) {
      this.vignetteGraphics.clear();
      // Render darkening vignette around camera viewport bounds
      const insetX = viewW * 0.15;
      const insetY = viewH * 0.15;

      // Dark borders
      this.vignetteGraphics
        .rect(camX, camY, viewW, insetY)
        .fill({ color: 0x05040a, alpha: 0.55 });
      this.vignetteGraphics
        .rect(camX, camY + viewH - insetY, viewW, insetY)
        .fill({ color: 0x05040a, alpha: 0.55 });
      this.vignetteGraphics
        .rect(camX, camY + insetY, insetX, viewH - 2 * insetY)
        .fill({ color: 0x05040a, alpha: 0.45 });
      this.vignetteGraphics
        .rect(
          camX + viewW - insetX,
          camY + insetY,
          insetX,
          viewH - 2 * insetY
        )
        .fill({ color: 0x05040a, alpha: 0.45 });
    } else {
      this.vignetteGraphics.clear();
    }

    // 3. Rain particle emitter (active while camera is in lake)
    const raining = this.isRaining();
    this.rainGraphics.clear();

    if (raining) {
      const dt = 1 / 60; // Standard nominal delta for particle integration
      for (const p of this.rainParticles) {
        p.y += p.speed * dt;
        p.x -= 40 * dt; // Slight wind slant

        // Wrap around camera view
        if (p.y > camY + viewH) {
          p.y = camY - p.length;
          p.x = camX + Math.random() * viewW;
        }
        if (p.x < camX) {
          p.x = camX + viewW;
        }

        // Draw raindrop streak
        this.rainGraphics
          .moveTo(p.x, p.y)
          .lineTo(p.x - 2, p.y + p.length)
          .stroke({
            width: 1,
            color: 0xafc8e8,
            alpha: p.alpha,
          });
      }
    }
  }
}
