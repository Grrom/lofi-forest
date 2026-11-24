import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Facing, PlayerAction, ZoneId } from '@lofi/shared';
import { PLAYER_SPEED_PX_S, TILE_SIZE } from '@lofi/shared';
import type { WorldLayers } from '../engine/layers';
import type { Camera } from '../engine/camera';
import type {
  ParsedDoor,
  ParsedSeat,
  ParsedTiledMap,
} from '../engine/tiled';
import { assetLoader } from '../engine/assets/AssetLoader';
import { gameEvents } from '../engine/events';
import {
  type CollisionMap,
  isTileSolid,
  moveWithCollision,
  PLAYER_COLLISION_RADIUS,
} from '../systems/collision';
import { findPath } from '../systems/pathfinding';
import { FastTravelSystem, defaultFastTravelSystem } from '../systems/FastTravelSystem';
import { spawnParticleBurst } from '../engine/particles';

export interface LocalPlayerOptions {
  initialX?: number;
  initialY?: number;
  initialZone?: ZoneId;
  skipPixi?: boolean;
  fastTravelSystem?: FastTravelSystem;
}

export function isInputFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    (active as HTMLElement).isContentEditable
  );
}

export interface TeleportTransition {
  phase: 'fade_out' | 'fade_in';
  startTime: number;
  durationMs: number;
  destX: number;
  destY: number;
  fadeStartTime: number;
  midpointTimeoutId?: any;
  finishTimeoutId?: any;
  onComplete?: () => void;
}

export class LocalPlayer {
  public x: number = 0;
  public y: number = 0;
  public zone: ZoneId = 'forest';
  public facing: Facing = 'down';
  public action: PlayerAction = 'idle';

  public isAutoStroll: boolean = false;
  public currentPath: Array<{ x: number; y: number }> = [];
  public lastPromptInteractTime = 0;

  public container?: Container;
  public sprite?: Sprite;
  public promptContainer?: Container;

  public map: ParsedTiledMap;
  public camera?: Camera;
  public layers?: WorldLayers;
  public collisionMap: CollisionMap;
  public fastTravelSystem?: FastTravelSystem;

  public teleportTransition: TeleportTransition | null = null;
  private inFlightTeleportPromise: Promise<void> | null = null;

  private keysPressed = new Set<string>();
  private activeSeat: ParsedSeat | null = null;
  private strollWaitUntilMs = 0;
  private doorCooldownUntilMs = 0;
  private lastDoorId: string | null = null;

  private onKeyDownBound?: (e: KeyboardEvent) => void;
  private onKeyUpBound?: (e: KeyboardEvent) => void;

  constructor(
    map: ParsedTiledMap,
    camera?: Camera,
    layers?: WorldLayers,
    options?: LocalPlayerOptions
  ) {
    this.map = map;
    this.camera = camera;
    this.layers = layers;

    this.collisionMap = {
      width: map.width,
      height: map.height,
      tileWidth: map.tileWidth || TILE_SIZE,
      tileHeight: map.tileHeight || TILE_SIZE,
      collision: map.collision,
    };

    // Initial position
    if (options?.initialX !== undefined && options?.initialY !== undefined) {
      this.x = options.initialX;
      this.y = options.initialY;
    } else if (map.spawn) {
      this.x =
        map.spawn.x % TILE_SIZE === 0 ? map.spawn.x + 8 : map.spawn.x;
      this.y =
        map.spawn.y % TILE_SIZE === 0 ? map.spawn.y + 8 : map.spawn.y;
    }

    if (options?.initialZone) {
      this.zone = options.initialZone;
    } else {
      this.zone = this.getZoneAt(this.x, this.y) || 'forest';
    }

    this.fastTravelSystem = options?.fastTravelSystem || defaultFastTravelSystem;
    this.fastTravelSystem.setMap(this.map);
    this.fastTravelSystem.setPlayer(this);

    // Setup Pixi containers if not skipped
    if (!options?.skipPixi && layers) {
      this.setupPixiVisuals();
    }

    // Bind DOM keyboard events if in browser
    if (typeof window !== 'undefined') {
      this.onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e.code);
      this.onKeyUpBound = (e: KeyboardEvent) => this.handleKeyUp(e.code);
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
    }
  }

  private setupPixiVisuals(): void {
    if (!this.layers) return;

    this.container = new Container();
    this.container.label = 'localPlayer';
    this.container.position.set(Math.round(this.x), Math.round(this.y));
    (this.container as any).footY = this.y;
    this.container.zIndex = Math.round(this.y);

    const baseTexture = assetLoader.getTextureSync('char_base');
    this.sprite = new Sprite(baseTexture);
    this.sprite.anchor.set(0.5, 1.0);
    this.container.addChild(this.sprite);

    this.layers.entityLayer.addChild(this.container);

    // [E] prompt container in worldUiLayer
    this.promptContainer = this.createPromptContainer();
    this.layers.worldUiLayer.addChild(this.promptContainer);
  }

  private createPromptContainer(): Container {
    const container = new Container();
    container.label = 'seatPrompt';
    container.visible = false;

    const bg = new Graphics();
    bg.roundRect(-8, -8, 16, 16, 3);
    bg.fill({ color: 0x211509, alpha: 0.9 });
    bg.stroke({ color: 0xfffaeb, width: 1 });

    const label = new Text({
      text: 'E',
      style: {
        fontFamily: 'monospace',
        fontSize: 10,
        fontWeight: 'bold',
        fill: 0xfffaeb,
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, 0);

    container.addChild(bg);
    container.addChild(label);

    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Rectangle(-16, -16, 32, 32);

    container.on('pointerdown', (e) => {
      e.stopPropagation();
      this.lastPromptInteractTime = Date.now();
      this.tapSeat();
    });

    return container;
  }

  public getLocalState(): {
    x: number;
    y: number;
    zone: ZoneId;
    facing: Facing;
    action: PlayerAction;
  } {
    return {
      x: this.x,
      y: this.y,
      zone: this.zone,
      facing: this.facing,
      action: this.action,
    };
  }

  public handleKeyDown(code: string): void {
    if (isInputFocused()) return;

    // Manual input cancels auto-stroll immediately
    if (this.isAutoStroll) {
      this.setAutoStroll(false);
    }

    gameEvents.emit('localInput', {});

    if (code === 'KeyE') {
      if (this.action === 'sit') {
        // Stand up on E
        this.action = 'idle';
      } else {
        this.sitNearestSeat();
      }
      return;
    }

    if (
      code === 'KeyW' ||
      code === 'KeyS' ||
      code === 'KeyA' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      // Movement key cancels any click-to-walk or stroll path
      this.currentPath = [];
      // Movement stands up from sitting
      if (this.action === 'sit') {
        this.action = 'walk';
      }
      this.keysPressed.add(code);
    }
  }

  public handleKeyUp(code: string): void {
    this.keysPressed.delete(code);
  }

  public setAutoStroll(enabled: boolean): void {
    if (this.isAutoStroll === enabled) return;
    this.isAutoStroll = enabled;

    if (enabled) {
      if (this.action === 'sit') {
        this.action = 'idle';
      }
      this.strollWaitUntilMs = 0;
      this.pickNextStrollTarget();
    } else {
      this.currentPath = [];
      if (this.action === 'walk') {
        this.action = 'idle';
      }
    }
  }

  public walkToTile(
    targetTileX: number,
    targetTileY: number,
    isManual = true
  ): boolean {
    if (isManual) {
      if (this.isAutoStroll) {
        this.setAutoStroll(false);
      }
      gameEvents.emit('localInput', {});
    }

    if (this.action === 'sit') {
      this.action = 'idle';
    }

    const curTileX = Math.floor(this.x / (this.collisionMap.tileWidth || TILE_SIZE));
    const curTileY = Math.floor(this.y / (this.collisionMap.tileHeight || TILE_SIZE));

    const path = findPath(
      { tileX: curTileX, tileY: curTileY },
      { tileX: targetTileX, tileY: targetTileY },
      this.collisionMap
    );

    if (!path || path.length === 0) {
      return false;
    }

    // Convert tile path to world pixel waypoints (tile centers)
    const tw = this.collisionMap.tileWidth || TILE_SIZE;
    const th = this.collisionMap.tileHeight || TILE_SIZE;

    const waypoints: Array<{ x: number; y: number }> = [];
    // Skip the first tile if player is already practically at its center
    for (let i = 1; i < path.length; i++) {
      waypoints.push({
        x: path[i].tileX * tw + tw / 2,
        y: path[i].tileY * th + th / 2,
      });
    }

    // If path has only 1 tile (start == goal), walk to its center
    if (waypoints.length === 0 && path.length === 1) {
      waypoints.push({
        x: path[0].tileX * tw + tw / 2,
        y: path[0].tileY * th + th / 2,
      });
    }

    this.currentPath = waypoints;
    return true;
  }

  public tapSeat(seat?: ParsedSeat | null): boolean {
    if (this.isAutoStroll) {
      this.setAutoStroll(false);
    }
    const sat = this.sitNearestSeat(seat);
    gameEvents.emit('localInput', {});
    return sat;
  }

  public sitNearestSeat(targetSeat?: ParsedSeat | null): boolean {
    const seat = targetSeat || this.activeSeat || this.getNearestSeat(20);
    if (!seat) return false;

    // E snaps the player to the seat, action='sit', foot y +2 px
    this.x = seat.x;
    this.y = seat.y + 2;
    this.action = 'sit';
    this.facing = 'down';
    this.currentPath = [];
    if (this.promptContainer) {
      this.promptContainer.visible = false;
    }
    return true;
  }

  public getNearestSeat(maxDist = 20): ParsedSeat | null {
    if (!this.map.seats || this.map.seats.length === 0) return null;

    let nearest: ParsedSeat | null = null;
    let minDist = maxDist;

    for (const seat of this.map.seats) {
      const dist = Math.hypot(this.x - seat.x, this.y - seat.y);
      if (dist <= minDist) {
        minDist = dist;
        nearest = seat;
      }
    }
    return nearest;
  }

  public enterDoor(door: ParsedDoor): void {
    const targetDoor = this.map.doors?.find(
      (d) =>
        d.doorId === door.targetDoorId ||
        d.name === door.targetDoorId ||
        String(d.id) === door.targetDoorId
    );
    if (!targetDoor) return;

    const tw = this.collisionMap.tileWidth || TILE_SIZE;
    const th = this.collisionMap.tileHeight || TILE_SIZE;

    // Find outward tile:
    // Direction from source door to target door
    const dirX = Math.sign(targetDoor.tileX - door.tileX);
    const dirY = Math.sign(targetDoor.tileY - door.tileY);

    let outTileX = targetDoor.tileX + dirX;
    let outTileY = targetDoor.tileY + dirY;

    // If the step candidate is solid or no movement direction, search adjacent non-solid neighbors
    if (
      isTileSolid(this.collisionMap, outTileX, outTileY) ||
      (dirX === 0 && dirY === 0)
    ) {
      const neighbors = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
      ];
      for (const n of neighbors) {
        const nx = targetDoor.tileX + n.dx;
        const ny = targetDoor.tileY + n.dy;
        if (
          !isTileSolid(this.collisionMap, nx, ny) &&
          !(nx === door.tileX && ny === door.tileY)
        ) {
          outTileX = nx;
          outTileY = ny;
          break;
        }
      }
    }

    const outX = outTileX * tw + tw / 2;
    const outY = outTileY * th + th / 2;

    this.x = outX;
    this.y = outY;
    this.currentPath = [];
    this.doorCooldownUntilMs = Date.now() + 1000;
    this.lastDoorId = targetDoor.doorId;

    this.camera?.lookAt(this.x, this.y);
    gameEvents.emit('teleported', { x: this.x, y: this.y });
    this.checkZoneChange();
  }

  /**
   * Teleports the player with the specified transition:
   * 1. firefly/leaf particle burst at player
   * 2. alpha fades 1 -> 0 over 250 ms
   * 3. move the player and snap the camera
   * 4. burst at destination, alpha back to 1 over 250 ms
   * 5. emit GameEvents.teleported {x, y}
   * The zone is re-evaluated after teleport.
   */
  public teleport(
    destX: number,
    destY: number,
    options?: { immediate?: boolean; onComplete?: () => void }
  ): Promise<void> {
    const isHeadless = !this.layers || options?.immediate;

    if (isHeadless) {
      if (this.teleportTransition) {
        if (this.teleportTransition.midpointTimeoutId) {
          clearTimeout(this.teleportTransition.midpointTimeoutId);
        }
        if (this.teleportTransition.finishTimeoutId) {
          clearTimeout(this.teleportTransition.finishTimeoutId);
        }
        this.teleportTransition = null;
      }
      this.inFlightTeleportPromise = null;
      this.x = destX;
      this.y = destY;
      this.currentPath = [];
      this.camera?.lookAt(this.x, this.y);
      this.syncVisuals();
      gameEvents.emit('teleported', { x: destX, y: destY });
      this.checkZoneChange();
      options?.onComplete?.();
      return Promise.resolve();
    }

    if (this.teleportTransition) {
      return this.inFlightTeleportPromise || Promise.resolve();
    }

    const promise = new Promise<void>((resolve) => {
      this.currentPath = [];

      // 1. Particle burst at the player
      if (this.layers) {
        spawnParticleBurst(this.x, this.y, this.layers.entityLayer);
      }

      // 2. Alpha fade 1 -> 0 over 250 ms
      const startTime = Date.now();
      const transition: TeleportTransition = {
        phase: 'fade_out',
        startTime,
        durationMs: 250,
        destX,
        destY,
        fadeStartTime: 0,
        onComplete: () => {
          this.inFlightTeleportPromise = null;
          options?.onComplete?.();
          resolve();
        },
      };
      this.teleportTransition = transition;

      // Fallback timeouts to ensure completion if tab is backgrounded
      transition.midpointTimeoutId = setTimeout(() => {
        if (
          this.teleportTransition &&
          this.teleportTransition === transition &&
          this.teleportTransition.phase === 'fade_out'
        ) {
          this.executeTeleportMidpoint();
        }
      }, 260);

      transition.finishTimeoutId = setTimeout(() => {
        if (
          this.teleportTransition &&
          this.teleportTransition === transition &&
          this.teleportTransition.phase === 'fade_in'
        ) {
          this.finishTeleport();
        }
      }, 520);
    });

    this.inFlightTeleportPromise = promise;
    return promise;
  }

  public executeTeleportMidpoint(): void {
    if (!this.teleportTransition || this.teleportTransition.phase !== 'fade_out') return;
    if (this.teleportTransition.midpointTimeoutId) {
      clearTimeout(this.teleportTransition.midpointTimeoutId);
      this.teleportTransition.midpointTimeoutId = null;
    }
    this.x = this.teleportTransition.destX;
    this.y = this.teleportTransition.destY;
    this.camera?.lookAt(this.x, this.y);
    this.syncVisuals();

    // 4. Burst at destination
    if (this.layers) {
      spawnParticleBurst(this.x, this.y, this.layers.entityLayer);
    }

    this.teleportTransition.phase = 'fade_in';
    this.teleportTransition.fadeStartTime = Date.now();
  }

  public finishTeleport(): void {
    if (!this.teleportTransition) return;
    const destX = this.teleportTransition.destX;
    const destY = this.teleportTransition.destY;
    const onComplete = this.teleportTransition.onComplete;
    if (this.teleportTransition.midpointTimeoutId) {
      clearTimeout(this.teleportTransition.midpointTimeoutId);
    }
    if (this.teleportTransition.finishTimeoutId) {
      clearTimeout(this.teleportTransition.finishTimeoutId);
    }
    this.teleportTransition = null;
    this.inFlightTeleportPromise = null;

    if (this.container) {
      this.container.alpha = 1;
    }

    // 5. Emit GameEvents.teleported {x, y}
    gameEvents.emit('teleported', { x: destX, y: destY });

    // Zone re-evaluation after teleport
    this.checkZoneChange();

    onComplete?.();
  }

  public teleportToLandmark(
    landmarkId: string,
    options?: { immediate?: boolean; onComplete?: () => void }
  ): Promise<boolean> | boolean {
    if (this.fastTravelSystem) {
      return this.fastTravelSystem.teleportToLandmark(landmarkId, options);
    }
    return false;
  }

  public teleportNear(
    x: number,
    y: number,
    options?: { immediate?: boolean; onComplete?: () => void }
  ): boolean {
    if (this.fastTravelSystem) {
      return this.fastTravelSystem.teleportNear(x, y, options);
    }
    return false;
  }

  public getZoneAt(x: number, y: number): ZoneId | null {
    if (!this.map.zoneTriggers) return null;
    for (const trigger of this.map.zoneTriggers) {
      if (
        x >= trigger.x &&
        x <= trigger.x + trigger.width &&
        y >= trigger.y &&
        y <= trigger.y + trigger.height
      ) {
        return trigger.zone;
      }
    }
    return null;
  }

  public checkZoneChange(): void {
    const newZone = this.getZoneAt(this.x, this.y);
    if (newZone && newZone !== this.zone) {
      this.zone = newZone;
      gameEvents.emit('zoneChanged', { zone: newZone });
    }
  }

  private pickNextStrollTarget(): void {
    // Gather reachable candidate waypoints in current zone
    const candidates: Array<{ tileX: number; tileY: number }> = [];

    // 1. Seats in current zone
    if (this.map.seats) {
      for (const s of this.map.seats) {
        const zone = this.getZoneAt(s.x, s.y);
        if (zone === this.zone && !isTileSolid(this.collisionMap, s.tileX, s.tileY)) {
          candidates.push({ tileX: s.tileX, tileY: s.tileY });
        }
      }
    }

    // 2. Landmarks in current zone
    if (this.map.landmarks) {
      for (const lm of this.map.landmarks) {
        const zone = this.getZoneAt(lm.x, lm.y);
        if (zone === this.zone && !isTileSolid(this.collisionMap, lm.tileX, lm.tileY)) {
          candidates.push({ tileX: lm.tileX, tileY: lm.tileY });
        }
      }
    }

    // 3. Campfires in current zone (walk to adjacent non-solid tile)
    if (this.map.campfires) {
      for (const cf of this.map.campfires) {
        const zone = this.getZoneAt(cf.x, cf.y);
        if (zone === this.zone) {
          const neighbors = [
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
          ];
          for (const n of neighbors) {
            const nx = cf.tileX + n.dx;
            const ny = cf.tileY + n.dy;
            if (!isTileSolid(this.collisionMap, nx, ny)) {
              candidates.push({ tileX: nx, tileY: ny });
              break;
            }
          }
        }
      }
    }

    const curTileX = Math.floor(this.x / (this.collisionMap.tileWidth || TILE_SIZE));
    const curTileY = Math.floor(this.y / (this.collisionMap.tileHeight || TILE_SIZE));

    // Filter to reachable candidates that are not the current tile
    const reachable = candidates.filter((c) => {
      const path = findPath(
        { tileX: curTileX, tileY: curTileY },
        c,
        this.collisionMap
      );
      return path !== null && path.length > 1;
    });

    if (reachable.length === 0) {
      // Retry in 4 seconds
      this.strollWaitUntilMs = Date.now() + 4000;
      return;
    }

    const picked = reachable[Math.floor(Math.random() * reachable.length)];
    this.walkToTile(picked.tileX, picked.tileY, false);
  }

  public update(dt: number): void {
    // Delta time comes from the Pixi ticker, capped at 100 ms
    const cappedDt = Math.min(0.1, Math.max(0, dt));

    // Handle Active Teleport Transition
    if (this.teleportTransition) {
      const now = Date.now();
      if (this.teleportTransition.phase === 'fade_out') {
        const elapsed = now - this.teleportTransition.startTime;
        const progress = Math.min(1, Math.max(0, elapsed / 250));
        if (this.container) {
          this.container.alpha = 1 - progress;
        }
        if (elapsed >= 250) {
          this.executeTeleportMidpoint();
        }
      } else if (this.teleportTransition.phase === 'fade_in') {
        const elapsed = now - this.teleportTransition.fadeStartTime;
        const progress = Math.min(1, Math.max(0, elapsed / 250));
        if (this.container) {
          this.container.alpha = progress;
        }
        if (elapsed >= 250) {
          this.finishTeleport();
        }
      }
      this.syncVisuals();
      return;
    }

    // Handle Sitting State
    if (this.action === 'sit') {
      // Movement input stands up
      let hasMovementKey = false;
      if (!isInputFocused()) {
        hasMovementKey =
          this.keysPressed.has('KeyW') ||
          this.keysPressed.has('KeyS') ||
          this.keysPressed.has('KeyA') ||
          this.keysPressed.has('KeyD') ||
          this.keysPressed.has('ArrowUp') ||
          this.keysPressed.has('ArrowDown') ||
          this.keysPressed.has('ArrowLeft') ||
          this.keysPressed.has('ArrowRight');
      }

      if (hasMovementKey) {
        this.action = 'walk';
      } else {
        // While sitting, hide prompt and sync visual container
        if (this.promptContainer) {
          this.promptContainer.visible = false;
        }
        this.syncVisuals();
        return;
      }
    }

    // Handle Keyboard Movement
    let inputX = 0;
    let inputY = 0;

    if (!isInputFocused()) {
      if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
        inputY -= 1;
      }
      if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
        inputY += 1;
      }
      if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
        inputX -= 1;
      }
      if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
        inputX += 1;
      }
    }

    if (inputX !== 0 || inputY !== 0) {
      // Cancel click-to-walk or stroll path when keyboard input starts
      this.currentPath = [];

      const len = Math.hypot(inputX, inputY);
      const moveX = (inputX / len) * PLAYER_SPEED_PX_S * cappedDt;
      const moveY = (inputY / len) * PLAYER_SPEED_PX_S * cappedDt;

      const nextPos = moveWithCollision(
        { x: this.x, y: this.y },
        moveX,
        moveY,
        this.collisionMap,
        PLAYER_COLLISION_RADIUS
      );

      this.x = nextPos.x;
      this.y = nextPos.y;

      // Update facing
      if (Math.abs(inputX) >= Math.abs(inputY)) {
        this.facing = inputX > 0 ? 'right' : 'left';
      } else {
        this.facing = inputY > 0 ? 'down' : 'up';
      }
      this.action = 'walk';
    } else if (this.currentPath.length > 0) {
      // Follow pathfinding waypoints
      const nextWp = this.currentPath[0];
      const dx = nextWp.x - this.x;
      const dy = nextWp.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = PLAYER_SPEED_PX_S * cappedDt;

      if (dist <= step || dist < 1.0) {
        this.x = nextWp.x;
        this.y = nextWp.y;
        this.currentPath.shift();

        if (this.currentPath.length === 0) {
          this.action = 'idle';
          if (this.isAutoStroll) {
            // Wait 4-10 s, repeat
            const waitMs = 4000 + Math.random() * 6000;
            this.strollWaitUntilMs = Date.now() + waitMs;
          }
        }
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        const moveX = nx * step;
        const moveY = ny * step;

        const prevX = this.x;
        const prevY = this.y;

        const nextPos = moveWithCollision(
          { x: this.x, y: this.y },
          moveX,
          moveY,
          this.collisionMap,
          PLAYER_COLLISION_RADIUS
        );

        const actualMoved = Math.hypot(nextPos.x - prevX, nextPos.y - prevY);
        this.x = nextPos.x;
        this.y = nextPos.y;

        if (Math.abs(nx) >= Math.abs(ny)) {
          this.facing = nx > 0 ? 'right' : 'left';
        } else {
          this.facing = ny > 0 ? 'down' : 'up';
        }
        this.action = 'walk';

        // Stop when blocked
        if (step > 0.1 && actualMoved < 0.01) {
          this.currentPath = [];
          this.action = 'idle';
          if (this.isAutoStroll) {
            this.strollWaitUntilMs = Date.now() + 2000;
          }
        }
      }
    } else {
      // Idle
      if (this.action === 'walk') {
        this.action = 'idle';
      }

      if (this.isAutoStroll && Date.now() >= this.strollWaitUntilMs) {
        this.pickNextStrollTarget();
      }
    }

    // Door check: stepping onto a door moves to paired door
    const curTileX = Math.floor(
      this.x / (this.collisionMap.tileWidth || TILE_SIZE)
    );
    const curTileY = Math.floor(
      this.y / (this.collisionMap.tileHeight || TILE_SIZE)
    );

    if (Date.now() >= this.doorCooldownUntilMs && this.map.doors) {
      const doorHere = this.map.doors.find(
        (d) => d.tileX === curTileX && d.tileY === curTileY
      );
      if (doorHere && doorHere.doorId !== this.lastDoorId) {
        this.enterDoor(doorHere);
      } else if (!doorHere) {
        this.lastDoorId = null;
      }
    }

    // Zone check: current zone is the zone_trigger containing the player
    this.checkZoneChange();

    // Fast travel landmark check
    this.fastTravelSystem?.checkPosition(this.x, this.y);

    // Seats prompt check: within 20 px of a seat, show [E] prompt
    this.activeSeat = this.getNearestSeat(20);
    if (this.promptContainer) {
      if (this.activeSeat) {
        this.promptContainer.visible = true;
        this.promptContainer.position.set(
          this.activeSeat.x,
          this.activeSeat.y - 12
        );
      } else {
        this.promptContainer.visible = false;
      }
    }

    // Sync Pixi visuals and camera
    this.syncVisuals();
    this.camera?.lookAt(this.x, this.y);
  }

  private syncVisuals(): void {
    if (!this.container) return;

    this.container.position.set(Math.round(this.x), Math.round(this.y));
    (this.container as any).footY = this.y;
    this.container.zIndex = Math.round(this.y);

    if (this.sprite) {
      if (this.facing === 'left') {
        this.sprite.scale.x = -1;
      } else {
        this.sprite.scale.x = 1;
      }
    }
  }

  public destroy(): void {
    if (this.teleportTransition) {
      if (this.teleportTransition.midpointTimeoutId) {
        clearTimeout(this.teleportTransition.midpointTimeoutId);
      }
      if (this.teleportTransition.finishTimeoutId) {
        clearTimeout(this.teleportTransition.finishTimeoutId);
      }
      this.teleportTransition = null;
    }
    this.inFlightTeleportPromise = null;

    if (typeof window !== 'undefined') {
      if (this.onKeyDownBound) {
        window.removeEventListener('keydown', this.onKeyDownBound);
      }
      if (this.onKeyUpBound) {
        window.removeEventListener('keyup', this.onKeyUpBound);
      }
    }
    this.container?.destroy({ children: true });
    this.promptContainer?.destroy({ children: true });
  }
}
