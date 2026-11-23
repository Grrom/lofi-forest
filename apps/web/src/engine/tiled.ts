import { Sprite } from 'pixi.js';
import type { ZoneId } from '@lofi/shared';
import { TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES } from '@lofi/shared';
import type { WorldLayers } from './layers';
import { assetLoader, type AssetLoader } from './assets/AssetLoader';

// -------------------------------------------------------------
// Pure parse types and step (No Pixi dependencies)
// -------------------------------------------------------------

export interface TiledRawProperty {
  name: string;
  type?: string;
  value: string | number | boolean;
}

export interface TiledRawObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible?: boolean;
  properties?: TiledRawProperty[];
}

export type TiledObject = TiledRawObject;

export interface TiledRawLayer {
  id?: number;
  name: string;
  type: 'tilelayer' | 'objectgroup';
  data?: number[];
  objects?: TiledRawObject[];
  width?: number;
  height?: number;
  visible?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
}

export interface TiledMapJson {
  compressionlevel?: number;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  orientation?: string;
  renderorder?: string;
  tiledversion?: string;
  version?: string;
  type?: string;
  layers: TiledRawLayer[];
  tilesets?: any[];
}

export interface ParsedSpawn {
  id: number;
  name: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export interface ParsedSeat {
  id: number;
  name: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  seatKind: string;
}

export interface ParsedLandmark {
  id: string;
  label: string;
  radius: number;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export interface ParsedZoneTrigger {
  id: number;
  name: string;
  zone: ZoneId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedCampfire {
  id: number;
  name: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export interface ParsedDoor {
  id: number;
  name: string;
  doorId: string;
  targetDoorId: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export interface ParsedCameraFocus {
  id: number;
  name: string;
  zone: ZoneId;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
}

export interface ParsedTiledMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  // Tile layers
  ground: number[];
  decor: number[];
  entities: number[];
  canopy: number[];
  collision: number[]; // 0 = non-solid, >0 = solid
  // Objects
  spawn: ParsedSpawn;
  seats: ParsedSeat[];
  landmarks: ParsedLandmark[];
  zoneTriggers: ParsedZoneTrigger[];
  campfires: ParsedCampfire[];
  doors: ParsedDoor[];
  cameraFoci: ParsedCameraFocus[];
}

function getPropValue(
  props: TiledRawProperty[] | undefined,
  name: string
): any {
  if (!props) return undefined;
  const prop = props.find((p) => p.name === name);
  return prop ? prop.value : undefined;
}

/**
 * Pure parse step: converts raw Tiled JSON into structured ParsedTiledMap.
 */
export function parseTiledMap(raw: TiledMapJson): ParsedTiledMap {
  const width = raw.width;
  const height = raw.height;
  const tileWidth = raw.tilewidth || TILE_SIZE;
  const tileHeight = raw.tileheight || TILE_SIZE;

  const findTileLayer = (name: string): number[] => {
    const layer = raw.layers.find(
      (l) => l.name === name && l.type === 'tilelayer'
    );
    if (!layer || !layer.data) {
      return new Array<number>(width * height).fill(0);
    }
    return layer.data;
  };

  const ground = findTileLayer('ground');
  const decor = findTileLayer('decor');
  const entities = findTileLayer('entities');
  const canopy = findTileLayer('canopy');
  const collision = findTileLayer('collision');

  const objectLayer = raw.layers.find(
    (l) => l.name === 'objects' && l.type === 'objectgroup'
  );
  const rawObjects = objectLayer?.objects || [];

  let spawn: ParsedSpawn | null = null;
  const seats: ParsedSeat[] = [];
  const landmarks: ParsedLandmark[] = [];
  const zoneTriggers: ParsedZoneTrigger[] = [];
  const campfires: ParsedCampfire[] = [];
  const doors: ParsedDoor[] = [];
  const cameraFoci: ParsedCameraFocus[] = [];

  for (const obj of rawObjects) {
    const type = (obj.type || obj.class || '').toLowerCase();
    const x = obj.x;
    const y = obj.y;
    const tileX = Math.floor(x / tileWidth);
    const tileY = Math.floor(y / tileHeight);

    if (type === 'spawn') {
      spawn = {
        id: obj.id,
        name: obj.name,
        x,
        y,
        tileX,
        tileY,
      };
    } else if (type === 'seat') {
      const seatKind = String(getPropValue(obj.properties, 'seatKind') || 'log');
      seats.push({
        id: obj.id,
        name: obj.name,
        x,
        y,
        tileX,
        tileY,
        seatKind,
      });
    } else if (type === 'landmark') {
      const id = String(getPropValue(obj.properties, 'id') || obj.name);
      const label = String(getPropValue(obj.properties, 'label') || id);
      const radius = Number(getPropValue(obj.properties, 'radius') || 48);
      landmarks.push({
        id,
        label,
        radius,
        x,
        y,
        tileX,
        tileY,
      });
    } else if (type === 'zone_trigger') {
      const zone = String(
        getPropValue(obj.properties, 'zone') || 'forest'
      ) as ZoneId;
      zoneTriggers.push({
        id: obj.id,
        name: obj.name,
        zone,
        x: obj.x,
        y: obj.y,
        width: obj.width || tileWidth,
        height: obj.height || tileHeight,
      });
    } else if (type === 'campfire') {
      campfires.push({
        id: obj.id,
        name: obj.name,
        x,
        y,
        tileX,
        tileY,
      });
    } else if (type === 'door') {
      const doorId = String(
        getPropValue(obj.properties, 'doorId') || obj.name || obj.id
      );
      const targetDoorId = String(
        getPropValue(obj.properties, 'targetDoorId') || ''
      );
      doors.push({
        id: obj.id,
        name: obj.name,
        doorId,
        targetDoorId,
        x,
        y,
        tileX,
        tileY,
      });
    } else if (type === 'camera_focus') {
      const zone = String(
        getPropValue(obj.properties, 'zone') || 'forest'
      ) as ZoneId;
      cameraFoci.push({
        id: obj.id,
        name: obj.name,
        zone,
        x,
        y,
        tileX,
        tileY,
      });
    }
  }

  if (!spawn) {
    // Default fallback spawn if missing
    spawn = {
      id: 0,
      name: 'spawn',
      x: 0,
      y: 0,
      tileX: 0,
      tileY: 0,
    };
  }

  return {
    width,
    height,
    tileWidth,
    tileHeight,
    ground,
    decor,
    entities,
    canopy,
    collision,
    spawn,
    seats,
    landmarks,
    zoneTriggers,
    campfires,
    doors,
    cameraFoci,
  };
}

/**
 * Pure BFS reachability validator over non-solid tiles starting from spawn.
 * If connectDoors is true, door pairs provide bidirectional edges between door tiles.
 */
export function bfsReachableLandmarks(
  map: ParsedTiledMap,
  connectDoors = true
): Set<string> {
  const reached = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [];

  const key = (x: number, y: number) => `${x},${y}`;

  // Start at spawn tile
  queue.push([map.spawn.tileX, map.spawn.tileY]);
  visited.add(key(map.spawn.tileX, map.spawn.tileY));

  // Map door locations for fast lookup
  const doorByTile = new Map<string, ParsedDoor>();
  const doorById = new Map<string, ParsedDoor>();
  for (const door of map.doors) {
    doorByTile.set(key(door.tileX, door.tileY), door);
    doorById.set(door.doorId, door);
    doorById.set(door.name, door);
    doorById.set(String(door.id), door);
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    const curPx = cx * map.tileWidth + map.tileWidth / 2;
    const curPy = cy * map.tileHeight + map.tileHeight / 2;

    // Check if any landmark was reached
    for (const landmark of map.landmarks) {
      const lCenterPx = landmark.x + map.tileWidth / 2;
      const lCenterPy = landmark.y + map.tileHeight / 2;
      const dx = curPx - lCenterPx;
      const dy = curPy - lCenterPy;
      const dist = Math.hypot(dx, dy);
      if (dist <= landmark.radius) {
        reached.add(landmark.id);
      }
    }

    // Door teleport edge
    if (connectDoors) {
      const doorHere = doorByTile.get(key(cx, cy));
      if (doorHere && doorHere.targetDoorId) {
        const partner = doorById.get(doorHere.targetDoorId);
        if (partner) {
          const pk = key(partner.tileX, partner.tileY);
          if (!visited.has(pk)) {
            visited.add(pk);
            queue.push([partner.tileX, partner.tileY]);
          }
        }
      }
    }

    // 4-way adjacent steps
    const neighbors: Array<[number, number]> = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
        const nk = key(nx, ny);
        if (!visited.has(nk)) {
          const isSolid = map.collision[ny * map.width + nx] > 0;
          if (!isSolid) {
            visited.add(nk);
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  return reached;
}

// -------------------------------------------------------------
// Render step (PixiJS integration)
// -------------------------------------------------------------

export interface TiledMapRenderer {
  waterSprites: Sprite[];
  currentWaterFrame: number;
  update(nowMs?: number): void;
}

export function renderTiledMap(
  map: ParsedTiledMap,
  layers: WorldLayers,
  loader: AssetLoader = assetLoader
): TiledMapRenderer {
  const waterSprites: Sprite[] = [];
  let currentWaterFrame = 0;

  const renderLayer = (
    data: number[],
    targetContainer: import('pixi.js').Container,
    isEntityLayer = false
  ) => {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const gid = data[y * map.width + x];
        if (gid <= 0) continue;

        // Tile GIDs 1-indexed to placeholders
        // GID 4 is water_0, GID 5 is water_1
        const texture = loader.getTileTextureSync(gid - 1);
        const sprite = new Sprite(texture);
        sprite.x = x * map.tileWidth;
        sprite.y = y * map.tileHeight;
        sprite.width = map.tileWidth;
        sprite.height = map.tileHeight;

        if (isEntityLayer) {
          const footY = (y + 1) * map.tileHeight;
          (sprite as any).footY = footY;
          sprite.zIndex = Math.round(footY);
        }

        if (gid === 4 || gid === 5) {
          waterSprites.push(sprite);
        }

        targetContainer.addChild(sprite);
      }
    }
  };

  // Render tile layers in order:
  // 1. ground -> groundLayer
  renderLayer(map.ground, layers.groundLayer);

  // 2. decor -> groundDecorLayer
  renderLayer(map.decor, layers.groundDecorLayer);

  // 3. entities -> entityLayer (sortable by zIndex = Math.round(footY))
  renderLayer(map.entities, layers.entityLayer, true);

  // 4. canopy -> canopyLayer
  renderLayer(map.canopy, layers.canopyLayer);

  return {
    waterSprites,
    currentWaterFrame,
    update(nowMs = Date.now()) {
      // Water frame swap every 500 ms based on wall-clock time
      const frame = Math.floor(nowMs / 500) % 2;
      if (frame !== this.currentWaterFrame) {
        this.currentWaterFrame = frame;
        const waterTex = loader.getTileTextureSync(
          frame === 0 ? 'water_0' : 'water_1'
        );
        for (const sprite of this.waterSprites) {
          sprite.texture = waterTex;
        }
      }

      // Update entity layer z-indices
      for (const child of layers.entityLayer.children) {
        const footY = (child as any).footY;
        if (typeof footY === 'number') {
          child.zIndex = Math.round(footY);
        }
      }
      layers.entityLayer.sortChildren();
    },
  };
}
