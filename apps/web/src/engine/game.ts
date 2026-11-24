import { Application, Container } from 'pixi.js';
import { setupPixi } from './pixiSetup';
import { assetLoader } from './assets/AssetLoader';
import { createWorldLayers, type WorldLayers } from './layers';
import { Camera } from './camera';
import {
  parseTiledMap,
  renderTiledMap,
  type ParsedTiledMap,
  type TiledMapRenderer,
} from './tiled';
import { Atmosphere } from './atmosphere';
import { gameEvents } from './events';
import { LocalPlayer } from '../entities/LocalPlayer';
import { updateEmoteBubbles } from '../entities/EmoteBubble';
import { FastTravelSystem, defaultFastTravelSystem } from '../systems/FastTravelSystem';
import { updateActiveBursts, clearActiveBursts } from './particles';
import type { AssetManifest, EmoteId, PomoBadge, ZoneId } from '@lofi/shared';
import { pomodoroController } from '../systems/PomodoroController';
import { createTransport } from '../net/createTransport';
import type { TransportAdapter } from '../net/TransportAdapter';
import { NetSync } from '../net/NetSync';

export interface PomoEffectTargets {
  player?: {
    celebrate?: () => void;
  };
  atmosphere?: {
    setVignette?: (enabled: boolean) => void;
    pulseGlow?: () => void;
  };
}

export function applyPomoPhaseEffects(
  prevBadge: PomoBadge,
  nextBadge: PomoBadge,
  targets: PomoEffectTargets
): void {
  if (nextBadge === 'focus') {
    targets.atmosphere?.setVignette?.(true);
  } else {
    targets.atmosphere?.setVignette?.(false);
  }

  // on focus → break: celebrate(), pulseGlow(), vignette off
  if (prevBadge === 'focus' && nextBadge === 'break') {
    targets.player?.celebrate?.();
    targets.atmosphere?.pulseGlow?.();
  }
}

export class GameEngine {
  public app!: Application;
  public worldContainer!: Container;
  public layers!: WorldLayers;
  public camera!: Camera;
  public parsedMap!: ParsedTiledMap;
  public mapRenderer!: TiledMapRenderer;
  public atmosphere!: Atmosphere;
  public player!: LocalPlayer;
  public fastTravelSystem!: FastTravelSystem;
  public transport?: TransportAdapter;
  public netSync?: NetSync;
  public isDebug = false;

  private currentZone: ZoneId = 'forest';
  private keysPressed = new Set<string>();
  private lastTickMs = Date.now();
  private updateIntervalId: any = null;
  private unsubZoneChanged?: () => void;
  private unsubPomo?: () => void;

  public async init(canvasContainer?: HTMLElement): Promise<Application> {
    // 1. Ensure nearest neighbor scaleMode
    setupPixi();

    // 2. Load manifest
    const manifest: AssetManifest | null = await assetLoader
      .loadManifest()
      .catch((err) => {
        console.warn('Initial manifest load failed, using fallbacks:', err);
        return null;
      });

    // 3. Initialize Pixi Application:
    // antialias:false, roundPixels:true, resolution: Math.min(devicePixelRatio||1, 2), resizes with window
    this.app = new Application();
    const resolution =
      typeof window !== 'undefined'
        ? Math.min(window.devicePixelRatio || 1, 2)
        : 1;

    await this.app.init({
      antialias: false,
      roundPixels: true,
      resolution,
      resizeTo: typeof window !== 'undefined' ? window : undefined,
      backgroundColor: 0x111b11,
      autoDensity: true,
    });

    if (canvasContainer) {
      canvasContainer.prepend(this.app.canvas);
    } else if (typeof document !== 'undefined') {
      document.body.prepend(this.app.canvas);
    }

    // 4. World container and layers
    this.worldContainer = new Container();
    this.worldContainer.label = 'worldContainer';
    this.app.stage.addChild(this.worldContainer);
    this.layers = createWorldLayers(this.worldContainer);

    // 5. Load and parse starter map
    let mapJson: any = null;
    const mapSrc = manifest?.maps?.starter?.src;
    if (mapSrc) {
      try {
        const res = await fetch(mapSrc);
        if (res.ok) {
          mapJson = await res.json();
        }
      } catch (err) {
        console.warn(`Failed to fetch map from "${mapSrc}":`, err);
      }
    } else {
      assetLoader.warnOnce(
        'map:starter',
        '[GameEngine] Missing maps.starter.src in manifest; falling back to procedural starter map.'
      );
    }

    if (!mapJson) {
      // Fallback: dynamic generation if fetch fails
      const { generateStarterMap } = await import('./starterMapData');
      mapJson = generateStarterMap();
    }

    this.parsedMap = parseTiledMap(mapJson);
    this.mapRenderer = renderTiledMap(
      this.parsedMap,
      this.layers,
      assetLoader
    );

    // 6. Camera setup
    this.camera = new Camera();
    const initW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const initH = typeof window !== 'undefined' ? window.innerHeight : 600;
    this.camera.updateViewport(initW, initH);

    // 7. Atmosphere setup
    this.atmosphere = new Atmosphere(
      this.layers.atmosphereLayer,
      this.parsedMap.campfires
    );

    // 8. LocalPlayer setup (camera follows player)
    defaultFastTravelSystem.setMap(this.parsedMap);
    this.player = new LocalPlayer(
      this.parsedMap,
      this.camera,
      this.layers
    );
    defaultFastTravelSystem.setPlayer(this.player);
    this.fastTravelSystem = defaultFastTravelSystem;
    this.player.fastTravelSystem = defaultFastTravelSystem;

    this.currentZone = this.player.zone;
    this.atmosphere.setZone(this.player.zone);

    this.unsubZoneChanged = gameEvents.on('zoneChanged', ({ zone }) => {
      this.currentZone = zone;
      this.atmosphere.setZone(zone);
    });

    // 8b. Initial Pomodoro sync and event subscription
    const initialBadge = pomodoroController.localBadge();
    if (initialBadge === 'focus') {
      this.atmosphere.setVignette(true);
    }

    let prevBadge: PomoBadge = initialBadge;
    this.unsubPomo = gameEvents.on('pomoPhaseChanged', ({ phase }) => {
      applyPomoPhaseEffects(prevBadge, phase, {
        player: this.player,
        atmosphere: this.atmosphere,
      });
      prevBadge = phase;
    });

    // 8c. Transport & NetSync setup
    this.transport = createTransport();
    await this.transport.connect();
    this.netSync = new NetSync(this.transport, this.player, {
      layers: this.layers,
      worldUiLayer: this.layers.worldUiLayer,
      entityLayer: this.layers.entityLayer,
    });

    // Tap / Click-to-walk on canvas
    this.app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.isDebug) return;
      if (Date.now() - this.player.lastPromptInteractTime < 200) return;

      const rect = this.app.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldX = screenX / this.camera.zoom + this.camera.roundedX;
      const worldY = screenY / this.camera.zoom + this.camera.roundedY;

      // If near a seat and tapped directly on the seat/prompt, sit on it
      const seat = this.player.getNearestSeat(24);
      if (
        seat &&
        this.player.action !== 'sit' &&
        Math.hypot(worldX - seat.x, worldY - seat.y) <= 24
      ) {
        this.player.tapSeat(seat);
        return;
      }

      const tw = this.parsedMap.tileWidth || 16;
      const th = this.parsedMap.tileHeight || 16;
      const tileX = Math.floor(worldX / tw);
      const tileY = Math.floor(worldY / th);
      this.player.walkToTile(tileX, tileY);
    });

    // 9. Debug mode setup (?debug=1)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      this.isDebug = params.get('debug') === '1';

      if (this.isDebug) {
        window.addEventListener('keydown', (e) => {
          if (
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight'
          ) {
            this.keysPressed.add(e.key);
          }
        });

        window.addEventListener('keyup', (e) => {
          this.keysPressed.delete(e.key);
        });
      }

      window.addEventListener('resize', () => {
        this.camera.updateViewport(window.innerWidth, window.innerHeight);
      });
    }

    // 10. Start main loop with wall-clock time
    this.lastTickMs = Date.now();
    this.app.ticker.add(() => {
      this.tick();
    });

    return this.app;
  }

  public tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;

    // Sync camera viewport size
    if (typeof window !== 'undefined') {
      if (
        this.camera.viewportW !== window.innerWidth ||
        this.camera.viewportH !== window.innerHeight
      ) {
        this.camera.updateViewport(window.innerWidth, window.innerHeight);
      }
    }

    // Update player (simulation, collision, zones, doors, seats, camera follow)
    if (this.player) {
      this.player.update(dt);
    }

    // Free-pan debug camera (arrow keys) behind ?debug=1 overrides camera
    if (this.isDebug && this.keysPressed.size > 0) {
      const PAN_SPEED = 240; // px/s
      if (this.keysPressed.has('ArrowLeft')) {
        this.camera.x -= PAN_SPEED * dt;
      }
      if (this.keysPressed.has('ArrowRight')) {
        this.camera.x += PAN_SPEED * dt;
      }
      if (this.keysPressed.has('ArrowUp')) {
        this.camera.y -= PAN_SPEED * dt;
      }
      if (this.keysPressed.has('ArrowDown')) {
        this.camera.y += PAN_SPEED * dt;
      }
      this.camera.clamp();
    }

    // Camera transform applied to worldContainer
    // Scaled by camera.zoom, translated by -camera.roundedX * camera.zoom for crisp pixels with zero seams
    const zoom = this.camera.zoom;
    this.worldContainer.scale.set(zoom, zoom);
    this.worldContainer.position.set(
      -this.camera.roundedX * zoom,
      -this.camera.roundedY * zoom
    );

    // Update map animations (water frame swap every 500 ms)
    this.mapRenderer?.update(now);

    // Update atmosphere (glow flicker, pulse, rain, vignette)
    this.atmosphere?.update(this.camera, now);

    // Update remote players via netSync
    this.netSync?.update(dt, now);

    // Update active emote bubbles
    updateEmoteBubbles(now);

    // Update active particle bursts
    updateActiveBursts(now);
  }

  public triggerEmote(emoteId: EmoteId, now: number = Date.now()): boolean {
    return this.player?.triggerEmote(emoteId, now) ?? false;
  }

  public async connectPublicLobby(): Promise<void> {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', 'public');
      window.history.pushState({}, '', url.toString());
    }

    if (this.transport) {
      this.transport.disconnect();
    }
    if (this.netSync) {
      this.netSync.destroy();
    }

    this.transport = createTransport('?room=public');
    await this.transport.connect();

    if (this.player && this.layers) {
      this.netSync = new NetSync(this.transport, this.player, {
        layers: this.layers,
        worldUiLayer: this.layers.worldUiLayer,
        entityLayer: this.layers.entityLayer,
      });
    }
  }

  public destroy(): void {
    if (this.unsubZoneChanged) {
      this.unsubZoneChanged();
      this.unsubZoneChanged = undefined;
    }
    if (this.unsubPomo) {
      this.unsubPomo();
      this.unsubPomo = undefined;
    }
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.netSync?.destroy();
    this.transport?.disconnect();
    this.player?.destroy();
    clearActiveBursts();
    this.app?.destroy(true, { children: true, texture: false });
  }
}

export const gameEngine = new GameEngine();
(globalThis as any).__lofiGameEngine = gameEngine;
