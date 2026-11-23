import {
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
  TILE_SIZE,
} from '@lofi/shared';
import type { TiledMapJson, TiledObject } from './tiled';

export const GID = {
  EMPTY: 0,
  GRASS_0: 1,
  GRASS_1: 2,
  DIRT_PATH: 3,
  WATER_0: 4,
  WATER_1: 5,
  WOODEN_FLOOR: 6,
  WALL: 7,
  DOOR: 8,
  TREE_TRUNK: 9,
  TREE_CANOPY: 10,
  LOG_SEAT: 11,
  STOOL: 12,
  BENCH: 13,
  CAMPFIRE: 14,
  PIER_PLANKS: 15,
  RUG: 16,
  FLOWER: 17,
} as const;

export function generateStarterMap(): TiledMapJson {
  const width = MAP_WIDTH_TILES; // 128
  const height = MAP_HEIGHT_TILES; // 64
  const totalTiles = width * height;

  const groundData = new Array<number>(totalTiles).fill(GID.GRASS_0);
  const decorData = new Array<number>(totalTiles).fill(GID.EMPTY);
  const entitiesData = new Array<number>(totalTiles).fill(GID.EMPTY);
  const canopyData = new Array<number>(totalTiles).fill(GID.EMPTY);
  const collisionData = new Array<number>(totalTiles).fill(0); // 0 = non-solid, 1 = solid

  const setTile = (layer: number[], x: number, y: number, gid: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      layer[y * width + x] = gid;
    }
  };

  // Seeded pseudo-random generator for subtle meadow variation
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. Subtle grass variation (grass_1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pseudoRandom() < 0.08) {
        setTile(groundData, x, y, GID.GRASS_1);
      }
    }
  }

  // 2. Lakeside Dock (West area: x 0..28)
  // Water body: x 2..22, y 16..48
  for (let y = 16; y <= 48; y++) {
    for (let x = 2; x <= 22; x++) {
      setTile(groundData, x, y, GID.WATER_0);
      setTile(collisionData, x, y, 1); // Water is solid
    }
  }

  // Pier extending over water: from shore (x=23) out into lake to x=3, y=31..32
  for (let x = 3; x <= 23; x++) {
    for (let y = 31; y <= 32; y++) {
      setTile(groundData, x, y, GID.PIER_PLANKS);
      setTile(collisionData, x, y, 0); // Pier is walkable over water
    }
  }

  // Bench at end of pier (x=4, y=31)
  setTile(entitiesData, 4, 31, GID.BENCH);
  setTile(collisionData, 4, 31, 0); // Seat tile is NOT solid

  // 3. Dirt Path connecting Dock, Forest Clearing, and Pub Exterior
  // Path from Pier shore (x=24) to Clearing (x=56), y=31..32
  for (let x = 24; x <= 56; x++) {
    for (let y = 31; y <= 32; y++) {
      setTile(groundData, x, y, GID.DIRT_PATH);
      setTile(collisionData, x, y, 0);
    }
  }

  // Path through Clearing and eastward to Pub exterior approach (x=64 to 115), y=31..32
  for (let x = 64; x <= 115; x++) {
    for (let y = 31; y <= 32; y++) {
      setTile(groundData, x, y, GID.DIRT_PATH);
      setTile(collisionData, x, y, 0);
    }
  }

  // Approach north from y=31 up to Pub exterior entrance at (115, 29)
  for (let y = 29; y <= 31; y++) {
    for (let x = 114; x <= 115; x++) {
      setTile(groundData, x, y, GID.DIRT_PATH);
      setTile(collisionData, x, y, 0);
    }
  }

  // 4. Forest Clearing (Center: x 50..76, y 22..44)
  // Central Campfire at (60, 32)
  setTile(entitiesData, 60, 32, GID.CAMPFIRE);
  setTile(collisionData, 60, 32, 1); // Campfire center is solid

  // Sitting logs around campfire
  // North log seat at (60, 30)
  setTile(entitiesData, 60, 30, GID.LOG_SEAT);
  setTile(collisionData, 60, 30, 0); // Seat tile is not solid
  // South log seat at (60, 34)
  setTile(entitiesData, 60, 34, GID.LOG_SEAT);
  setTile(collisionData, 60, 34, 0); // Seat tile is not solid
  // East log seat at (62, 32)
  setTile(entitiesData, 62, 32, GID.LOG_SEAT);
  setTile(collisionData, 62, 32, 0); // Seat tile is not solid
  // West log seat at (56, 32)
  setTile(entitiesData, 56, 32, GID.LOG_SEAT);
  setTile(collisionData, 56, 32, 0); // Seat tile is not solid

  // Spawn tile at (58, 32)
  setTile(collisionData, 58, 32, 0); // Spawn is not solid

  // Flowers around clearing on decor layer
  const flowerPositions = [
    [52, 28],
    [54, 38],
    [68, 26],
    [72, 36],
    [53, 34],
    [67, 38],
  ];
  for (const [fx, fy] of flowerPositions) {
    setTile(decorData, fx, fy, GID.FLOWER);
  }

  // Trees around clearing perimeter (trunks on entities with collision, canopy on canopy)
  const treePositions = [
    [48, 22], [52, 20], [58, 18], [64, 18], [70, 20], [74, 22],
    [48, 42], [52, 44], [58, 46], [64, 46], [70, 44], [74, 42],
    [46, 28], [46, 36], [76, 28], [76, 36],
  ];
  for (const [tx, ty] of treePositions) {
    setTile(entitiesData, tx, ty, GID.TREE_TRUNK);
    setTile(canopyData, tx, ty - 1, GID.TREE_CANOPY);
    setTile(collisionData, tx, ty, 1);
  }

  // 5. Cozy Pub (East area, walled-off building)
  // Pub Exterior Door at (115, 29)
  setTile(entitiesData, 115, 29, GID.DOOR);
  setTile(collisionData, 115, 29, 0); // Walkable entrance tile

  // Solid enclosure walls completely surrounding the pub interior
  // Pub interior room spans x: 106..124, y: 8..27
  // Perimeter walls are at x=105, x=125, y=7, y=28
  for (let y = 7; y <= 28; y++) {
    // West wall
    setTile(entitiesData, 105, y, GID.WALL);
    setTile(collisionData, 105, y, 1);
    // East wall
    setTile(entitiesData, 125, y, GID.WALL);
    setTile(collisionData, 125, y, 1);
  }
  for (let x = 105; x <= 125; x++) {
    // North wall
    setTile(entitiesData, x, 7, GID.WALL);
    setTile(collisionData, x, 7, 1);
    // South wall
    setTile(entitiesData, x, 28, GID.WALL);
    setTile(collisionData, x, 28, 1);
  }

  // Interior Pub Door at (115, 27)
  setTile(entitiesData, 115, 27, GID.DOOR);
  setTile(collisionData, 115, 27, 0); // Walkable door tile

  // Pub interior floor: x 106..124, y 8..27
  for (let y = 8; y <= 27; y++) {
    for (let x = 106; x <= 124; x++) {
      setTile(groundData, x, y, GID.WOODEN_FLOOR);
      // If not already solid (walls/bars), it's non-solid walkable floor
      if (collisionData[y * width + x] !== 1) {
        setTile(collisionData, x, y, 0);
      }
    }
  }

  // Fireplace (campfire object) at (122, 10)
  setTile(entitiesData, 122, 10, GID.CAMPFIRE);
  setTile(collisionData, 122, 10, 1);

  // Rug in front of fireplace: x 119..121, y 10..12
  for (let y = 10; y <= 12; y++) {
    for (let x = 119; x <= 121; x++) {
      setTile(decorData, x, y, GID.RUG);
    }
  }

  // Bar counter at y=22, x 112..120
  for (let x = 112; x <= 120; x++) {
    setTile(entitiesData, x, 22, GID.WALL);
    setTile(collisionData, x, 22, 1);
  }

  // Bar stools at (113, 21), (115, 21), (117, 21), (119, 21)
  const stoolPositions = [
    [113, 21],
    [115, 21],
    [117, 21],
    [119, 21],
  ];
  for (const [sx, sy] of stoolPositions) {
    setTile(entitiesData, sx, sy, GID.STOOL);
    setTile(collisionData, sx, sy, 0); // Bar stool seat is not solid
  }

  // Objects layer definitions
  const objects: TiledObject[] = [
    // 1. Exactly one spawn
    {
      id: 1,
      name: 'spawn',
      type: 'spawn',
      x: 58 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      visible: true,
    },

    // 2. Seats with seatKind
    {
      id: 10,
      name: 'seat_log_north',
      type: 'seat',
      x: 60 * TILE_SIZE,
      y: 30 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'log' }],
    },
    {
      id: 11,
      name: 'seat_log_south',
      type: 'seat',
      x: 60 * TILE_SIZE,
      y: 34 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'log' }],
    },
    {
      id: 12,
      name: 'seat_log_east',
      type: 'seat',
      x: 62 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'log' }],
    },
    {
      id: 13,
      name: 'seat_log_west',
      type: 'seat',
      x: 56 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'log' }],
    },
    {
      id: 14,
      name: 'seat_dock_bench',
      type: 'seat',
      x: 4 * TILE_SIZE,
      y: 31 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'bench' }],
    },
    {
      id: 15,
      name: 'seat_pub_stool_1',
      type: 'seat',
      x: 113 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'stool' }],
    },
    {
      id: 16,
      name: 'seat_pub_stool_2',
      type: 'seat',
      x: 115 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'stool' }],
    },
    {
      id: 17,
      name: 'seat_pub_stool_3',
      type: 'seat',
      x: 117 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'stool' }],
    },
    {
      id: 18,
      name: 'seat_pub_stool_4',
      type: 'seat',
      x: 119 * TILE_SIZE,
      y: 21 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'seatKind', type: 'string', value: 'stool' }],
    },

    // 3. Landmarks
    {
      id: 20,
      name: 'landmark_forest_clearing',
      type: 'landmark',
      x: 60 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [
        { name: 'id', type: 'string', value: 'forest_clearing' },
        { name: 'label', type: 'string', value: 'Forest Clearing' },
        { name: 'radius', type: 'float', value: 64 },
      ],
    },
    {
      id: 21,
      name: 'landmark_lakeside_dock',
      type: 'landmark',
      x: 4 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [
        { name: 'id', type: 'string', value: 'lakeside_dock' },
        { name: 'label', type: 'string', value: 'Lakeside Dock' },
        { name: 'radius', type: 'float', value: 48 },
      ],
    },
    {
      id: 22,
      name: 'landmark_cozy_pub',
      type: 'landmark',
      x: 115 * TILE_SIZE,
      y: 17 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [
        { name: 'id', type: 'string', value: 'cozy_pub' },
        { name: 'label', type: 'string', value: 'Cozy Pub' },
        { name: 'radius', type: 'float', value: 64 },
      ],
    },

    // 4. Zone triggers
    {
      id: 30,
      name: 'zone_trigger_lake',
      type: 'zone_trigger',
      x: 0,
      y: 0,
      width: 28 * TILE_SIZE,
      height: 64 * TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'lake' }],
    },
    {
      id: 31,
      name: 'zone_trigger_forest',
      type: 'zone_trigger',
      x: 28 * TILE_SIZE,
      y: 0,
      width: 72 * TILE_SIZE,
      height: 64 * TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'forest' }],
    },
    {
      id: 32,
      name: 'zone_trigger_pub',
      type: 'zone_trigger',
      x: 100 * TILE_SIZE,
      y: 0,
      width: 28 * TILE_SIZE,
      height: 64 * TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'pub' }],
    },

    // 5. Campfires
    {
      id: 40,
      name: 'campfire_clearing',
      type: 'campfire',
      x: 60 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    },
    {
      id: 41,
      name: 'campfire_pub_fireplace',
      type: 'campfire',
      x: 122 * TILE_SIZE,
      y: 10 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    },

    // 6. Door pairs
    {
      id: 50,
      name: 'door_pub_exterior',
      type: 'door',
      x: 115 * TILE_SIZE,
      y: 29 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [
        { name: 'doorId', type: 'string', value: 'pub_exterior' },
        { name: 'targetDoorId', type: 'string', value: 'pub_interior' },
      ],
    },
    {
      id: 51,
      name: 'door_pub_interior',
      type: 'door',
      x: 115 * TILE_SIZE,
      y: 27 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [
        { name: 'doorId', type: 'string', value: 'pub_interior' },
        { name: 'targetDoorId', type: 'string', value: 'pub_exterior' },
      ],
    },

    // 7. Camera focus (at least one per zone)
    {
      id: 60,
      name: 'camera_focus_forest',
      type: 'camera_focus',
      x: 60 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'forest' }],
    },
    {
      id: 61,
      name: 'camera_focus_lake',
      type: 'camera_focus',
      x: 8 * TILE_SIZE,
      y: 32 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'lake' }],
    },
    {
      id: 62,
      name: 'camera_focus_pub',
      type: 'camera_focus',
      x: 115 * TILE_SIZE,
      y: 17 * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      properties: [{ name: 'zone', type: 'string', value: 'pub' }],
    },
  ];

  return {
    compressionlevel: -1,
    width,
    height,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    version: '1.10',
    type: 'map',
    tilesets: [
      {
        firstgid: 1,
        name: 'tileset_forest',
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: 64,
        columns: 8,
        image: '/assets/sprites/tileset_forest.png',
        imagewidth: 128,
        imageheight: 128,
      },
    ],
    layers: [
      {
        id: 1,
        name: 'ground',
        type: 'tilelayer',
        data: groundData,
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
      {
        id: 2,
        name: 'decor',
        type: 'tilelayer',
        data: decorData,
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
      {
        id: 3,
        name: 'entities',
        type: 'tilelayer',
        data: entitiesData,
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
      {
        id: 4,
        name: 'canopy',
        type: 'tilelayer',
        data: canopyData,
        width,
        height,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
      {
        id: 5,
        name: 'collision',
        type: 'tilelayer',
        data: collisionData,
        width,
        height,
        opacity: 1,
        visible: false, // non-zero = solid, not rendered
        x: 0,
        y: 0,
      },
      {
        id: 6,
        name: 'objects',
        type: 'objectgroup',
        objects,
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
      },
    ],
  };
}

export function serializeStarterMap(map: TiledMapJson = generateStarterMap()): string {
  return JSON.stringify(map, null, 2) + '\n';
}
