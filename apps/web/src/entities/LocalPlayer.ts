import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type {
  EmoteId,
  Facing,
  Outfit,
  PlayerAction,
  PomoBadge,
  ZoneId,
} from '@lofi/shared';
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
import { PlayerAvatar } from './PlayerAvatar';
import { AfkDetector } from '../systems/AfkDetector';
import { StorageManager } from '../systems/StorageManager';
import { showEmote, type EmoteBubble } from './EmoteBubble';
import { pomodoroController } from '../systems/PomodoroController';

export { showEmote, type EmoteBubble } from './EmoteBubble';

export function getEmoteFromKey(code: string, key?: string): EmoteId | null {
  const k = key || code;
  if (code === 'Digit1' || code === '1' || code === 'Numpad1' || k === '1') return 'heart';
  if (code === 'Digit2' || code === '2' || code === 'Numpad2' || k === '2') return 'coffee';
  if (code === 'Digit3' || code === '3' || code === 'Numpad3' || k === '3') return 'music';
  if (code === 'Digit4' || code === '4' || code === 'Numpad4' || k === '4') return 'wave';
  if (code === 'Digit5' || code === '5' || code === 'Numpad5' || k === '5') return 'zzz';
  if (code === 'Digit6' || code === '6' || code === 'Numpad6' || k === '6') return 'sparkle';
  return null;
}

export interface LocalPlayerOptions {
  initialX?: number;
  initialY?: number;
  initialZone?: ZoneId;
  skipPixi?: boolean;
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
  public avatar?: PlayerAvatar;
  public afkDetector?: AfkDetector;
  public promptContainer?: Container;

  public map: ParsedTiledMap;
  public camera?: Camera;
  public layers?: WorldLayers;
  public collisionMap: CollisionMap;

  private keysPressed = new Set<string>();
  private activeSeat: ParsedSeat | null = null;
  private strollWaitUntilMs = 0;
  private doorCooldownUntilMs = 0;
  private lastDoorId: string | null = null;
  private celebrateUntilMs = 0;
  private previousActionBeforeCelebrate: PlayerAction = 'idle';
  private lastEmoteTime = -Infinity;
  private unsubStorage?: () => void;
  private unsubPomo?: () => void;

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

    // Initialize AfkDetector
    this.afkDetector = new AfkDetector(
      this,
      () => this.isAutoStroll || pomodoroController.phase === 'focus'
    );

    this.unsubPomo = gameEvents.on('pomoPhaseChanged', ({ phase }) => {
      this.setStatus(phase);
    });

    // Setup Pixi containers if not skipped
    if (!options?.skipPixi && layers) {
      this.setupPixiVisuals();
    }

    // Bind DOM keyboard events if in browser
    if (typeof window !== 'undefined') {
      this.onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e.code, e.key);
      this.onKeyUpBound = (e: KeyboardEvent) => this.handleKeyUp(e.code);
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
    }
  }

  private setupPixiVisuals(): void {
    if (!this.layers) return;

    const prefs = StorageManager.get();
    this.avatar = new PlayerAvatar({
      outfit: prefs.profile.outfit,
      name: prefs.profile.name,
      showNames: prefs.showNames,
      facing: this.facing,
      action: this.action,
    });
    this.avatar.worldUiLayer = this.layers.worldUiLayer;
    this.avatar.setStatus(pomodoroController.localBadge());
    this.avatar.position.set(Math.round(this.x), Math.round(this.y));
    (this.avatar as any).footY = this.y;
    this.avatar.zIndex = Math.round(this.y);

    this.container = this.avatar;
    this.sprite = this.avatar.baseSprite;

    this.layers.entityLayer.addChild(this.avatar);

    // Subscribe to StorageManager to update avatar immediately when wardrobe/prefs change
    this.unsubStorage = StorageManager.subscribe((newPrefs) => {
      if (this.avatar) {
        this.avatar.setOutfit(newPrefs.profile.outfit);
        this.avatar.setName(newPrefs.profile.name);
        this.avatar.setShowNames(newPrefs.showNames);
      }
    });

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

  public get pomo(): PomoBadge {
    return pomodoroController.localBadge();
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

  public triggerEmote(emoteId: EmoteId, now: number = Date.now()): boolean {
    if (now - this.lastEmoteTime < 1000) {
      return false;
    }
    this.lastEmoteTime = now;

    if (this.afkDetector?.isSleeping) {
      this.afkDetector.wakeUp();
    }

    gameEvents.emit('localInput', {});
    gameEvents.emit('localEmote', { emote: emoteId });

    if (this.avatar) {
      showEmote(this.avatar, emoteId, this.layers?.worldUiLayer);
    }

    return true;
  }

  public handleKeyDown(
    code: string,
    key?: string,
    now: number = Date.now()
  ): void {
    if (isInputFocused()) return;

    // Manual input cancels auto-stroll immediately
    if (this.isAutoStroll) {
      this.setAutoStroll(false);
    }

    // Emote hotkeys 1-6
    const emoteId = getEmoteFromKey(code, key);
    if (emoteId) {
      this.triggerEmote(emoteId, now);
      return;
    }

    if (code === 'KeyV') {
      if (this.afkDetector?.isSleeping) {
        this.afkDetector.wakeUp();
      }
      this.action = this.action === 'vibe' ? 'idle' : 'vibe';
      gameEvents.emit('localInput', {});
      return;
    }

    if (code === 'KeyE') {
      if (this.afkDetector?.isSleeping) {
        this.afkDetector.wakeUp();
      }
      if (this.action === 'sit') {
        // Stand up on E
        this.action = 'idle';
      } else {
        this.sitNearestSeat();
      }
      gameEvents.emit('localInput', {});
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
      if (this.afkDetector?.isSleeping) {
        this.afkDetector.wakeUp();
      }
      // Movement key cancels any click-to-walk or stroll path
      this.currentPath = [];
      // Movement stands up from sitting
      if (this.action === 'sit') {
        this.action = 'walk';
      }
      this.keysPressed.add(code);
      gameEvents.emit('localInput', {});
      return;
    }

    gameEvents.emit('localInput', {});
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

    // Handle Celebrate state timer
    if (this.action === 'celebrate') {
      if (Date.now() >= this.celebrateUntilMs) {
        this.action = this.previousActionBeforeCelebrate || 'idle';
      }
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
        this.syncVisuals(cappedDt);
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
    this.syncVisuals(cappedDt);
    this.camera?.lookAt(this.x, this.y);
  }

  private syncVisuals(dt: number = 0.016): void {
    if (this.avatar) {
      this.avatar.position.set(Math.round(this.x), Math.round(this.y));
      (this.avatar as any).footY = this.y;
      this.avatar.zIndex = Math.round(this.y);
      this.avatar.setFacing(this.facing);
      this.avatar.setAction(this.action);
      this.avatar.update(dt, Date.now());
    } else if (this.container) {
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
  }

  public celebrate(): void {
    if (this.action !== 'celebrate') {
      this.previousActionBeforeCelebrate = this.action;
    }
    this.action = 'celebrate';
    this.celebrateUntilMs = Date.now() + 3000;
    this.avatar?.celebrate();
  }

  public setStatus(status: 'none' | 'focus' | 'break'): void {
    this.avatar?.setStatus(status);
  }

  public setOutfit(outfit: Outfit): void {
    this.avatar?.setOutfit(outfit);
  }

  public setName(name: string | null): void {
    this.avatar?.setName(name);
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      if (this.onKeyDownBound) {
        window.removeEventListener('keydown', this.onKeyDownBound);
      }
      if (this.onKeyUpBound) {
        window.removeEventListener('keyup', this.onKeyUpBound);
      }
    }
    if (this.unsubStorage) {
      this.unsubStorage();
      this.unsubStorage = undefined;
    }
    if (this.unsubPomo) {
      this.unsubPomo();
      this.unsubPomo = undefined;
    }
    this.afkDetector?.destroy();
    this.avatar?.destroy();
    this.container?.destroy({ children: true });
    this.promptContainer?.destroy({ children: true });
  }
}
