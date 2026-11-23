import { Application, Container } from 'pixi.js';
import { setupPixi } from './pixiSetup';
import { assetLoader } from './assets/AssetLoader';
import { createWorldLayers, type WorldLayers } from './layers';
import { Camera } from './camera';
import { parseTiledMap, renderTiledMap, type ParsedTiledMap, type TiledMapRenderer } from './tiled';
import { Atmosphere } from './atmosphere';
import { gameEvents } from './events';
import type { AssetManifest, ZoneId } from '@lofi/shared';

export class GameEngine {
  public app!: Application;
  public worldContainer!: Container;
  public layers!: WorldLayers;
  public camera!: Camera;
  public parsedMap!: ParsedTiledMap;
  public mapRenderer!: TiledMapRenderer;
  public atmosphere!: Atmosphere;
  public isDebug = false;

  private currentZone: ZoneId = 'forest';
  private keysPressed = new Set<string>();
  private lastTickMs = Date.now();
  private updateIntervalId: any = null;

  public async init(canvasContainer?: HTMLElement): Promise<Application> {
    // 1. Ensure nearest neighbor scaleMode
    setupPixi();

    // 2. Load manifest
    const manifest: AssetManifest | null = await assetLoader.loadManifest().catch((err) => {
      console.warn('Initial manifest load failed, using fallbacks:', err);
      return null;
    });

    // 3. Initialize Pixi Application:
    // antialias:false, roundPixels:true, resolution: Math.min(devicePixelRatio||1, 2), resizes with window
    this.app = new Application();
    const resolution = typeof window !== 'undefined'
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
    this.mapRenderer = renderTiledMap(this.parsedMap, this.layers, assetLoader);

    // 6. Camera setup
    this.camera = new Camera();
    const initW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const initH = typeof window !== 'undefined' ? window.innerHeight : 600;
    this.camera.updateViewport(initW, initH);
    this.camera.lookAt(this.parsedMap.spawn.x, this.parsedMap.spawn.y);

    // 7. Atmosphere setup
    this.atmosphere = new Atmosphere(
      this.layers.atmosphereLayer,
      this.parsedMap.campfires
    );

    // 8. Debug mode setup (?debug=1)
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

    // 9. Start main loop with wall-clock time
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

    // Free-pan debug camera (arrow keys) behind ?debug=1
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

    // Sync camera viewport size
    if (typeof window !== 'undefined') {
      if (
        this.camera.viewportW !== window.innerWidth ||
        this.camera.viewportH !== window.innerHeight
      ) {
        this.camera.updateViewport(window.innerWidth, window.innerHeight);
      }
    }

    // Determine current zone under camera focus center
    const viewW = this.camera.viewportW / this.camera.zoom;
    const viewH = this.camera.viewportH / this.camera.zoom;
    const centerX = this.camera.roundedX + viewW / 2;
    const centerY = this.camera.roundedY + viewH / 2;

    if (this.parsedMap?.zoneTriggers) {
      for (const trigger of this.parsedMap.zoneTriggers) {
        if (
          centerX >= trigger.x &&
          centerX <= trigger.x + trigger.width &&
          centerY >= trigger.y &&
          centerY <= trigger.y + trigger.height
        ) {
          if (this.currentZone !== trigger.zone) {
            this.currentZone = trigger.zone;
            this.atmosphere.setZone(trigger.zone);
            gameEvents.emit('zoneChanged', { zone: trigger.zone });
          }
          break;
        }
      }
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
  }

  public destroy(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.app?.destroy(true, { children: true, texture: false });
  }
}

export const gameEngine = new GameEngine();
