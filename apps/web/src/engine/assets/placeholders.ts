import { BufferImageSource, Texture } from 'pixi.js';
import type { EmoteId, HatId } from '@lofi/shared';

export type RGBA = [number, number, number, number];

export const TRANSPARENT: RGBA = [0, 0, 0, 0];

// Cozy palette definitions
export const PALETTE = {
  // Deep greens
  greenDarkest: [20, 42, 22, 255] as RGBA,
  greenDark: [30, 63, 32, 255] as RGBA,
  greenBase: [45, 90, 39, 255] as RGBA,
  greenMid: [62, 125, 52, 255] as RGBA,
  greenLight: [86, 158, 70, 255] as RGBA,
  greenSprout: [123, 198, 98, 255] as RGBA,

  // Warm browns
  brownDarkest: [33, 21, 9, 255] as RGBA,
  brownDark: [52, 35, 17, 255] as RGBA,
  brownBase: [74, 51, 25, 255] as RGBA,
  brownMid: [110, 76, 39, 255] as RGBA,
  brownLight: [140, 98, 57, 255] as RGBA,
  brownPale: [181, 131, 81, 255] as RGBA,

  // Lantern orange & warm lights
  orangeDark: [194, 65, 12, 255] as RGBA,
  orangeBase: [234, 88, 12, 255] as RGBA,
  orangeBright: [255, 152, 0, 255] as RGBA,
  orangeLight: [255, 204, 128, 255] as RGBA,
  warmWhite: [255, 250, 235, 255] as RGBA,

  // Water blues
  waterDeep: [35, 68, 96, 255] as RGBA,
  waterBase: [59, 111, 158, 255] as RGBA,
  waterLight: [86, 145, 200, 255] as RGBA,
  waterFoam: [175, 215, 245, 255] as RGBA,

  // Stone & neutrals
  stoneDark: [45, 45, 50, 255] as RGBA,
  stoneMid: [75, 75, 82, 255] as RGBA,
  stoneLight: [120, 120, 130, 255] as RGBA,

  // Emote accents
  heartRed: [217, 56, 72, 255] as RGBA,
  heartLight: [248, 113, 113, 255] as RGBA,
  starGold: [247, 183, 49, 255] as RGBA,
  starLight: [254, 240, 138, 255] as RGBA,
  musicPurple: [136, 84, 208, 255] as RGBA,
  musicLight: [192, 132, 252, 255] as RGBA,
  zzzLavender: [153, 128, 250, 255] as RGBA,
  skinTone: [245, 205, 121, 255] as RGBA,
  skinShadow: [224, 168, 92, 255] as RGBA,
  blushRed: [231, 127, 103, 255] as RGBA,
};

export function createProceduralTexture(
  width: number,
  height: number,
  getPixel: (x: number, y: number) => RGBA
): Texture {
  const buffer = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = getPixel(x, y);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }
  const source = new BufferImageSource({
    resource: buffer,
    width,
    height,
    alphaMode: 'premultiply-alpha-on-upload',
  });
  return new Texture({ source });
}

// 1. Grass 0 (default lush meadow)
function makeGrass0(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Subtle blade noise
    if ((x + y * 7) % 11 === 0) return PALETTE.greenLight;
    if ((x * 3 + y * 5) % 13 === 0) return PALETTE.greenSprout;
    if ((x * 7 + y * 3) % 17 === 0) return PALETTE.greenDark;
    return PALETTE.greenBase;
  });
}

// 2. Grass 1 (meadow variation with tiny yellow flowers)
function makeGrass1(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Tiny daisy at (5, 5) and (12, 10)
    if ((x === 5 && y === 5) || (x === 12 && y === 10)) return PALETTE.starGold;
    if (
      (Math.abs(x - 5) === 1 && y === 5) ||
      (x === 5 && Math.abs(y - 5) === 1) ||
      (Math.abs(x - 12) === 1 && y === 10) ||
      (x === 12 && Math.abs(y - 10) === 1)
    ) {
      return PALETTE.warmWhite;
    }
    if ((x + y * 5) % 9 === 0) return PALETTE.greenMid;
    if ((x * 5 + y * 11) % 15 === 0) return PALETTE.greenLight;
    return PALETTE.greenBase;
  });
}

// 3. Dirt path
function makeDirtPath(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) {
      if ((x + y) % 3 === 0) return PALETTE.greenDark;
      return PALETTE.brownDark;
    }
    if ((x * 7 + y * 13) % 19 === 0) return PALETTE.brownDarkest;
    if ((x * 11 + y * 5) % 17 === 0) return PALETTE.brownPale;
    if ((x + y * 3) % 7 === 0) return PALETTE.brownBase;
    return PALETTE.brownMid;
  });
}

// 4. Water 0 (calm pond frame 1)
function makeWater0(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Ripple horizontal waves at y=4, y=11
    if (y === 4 && x >= 3 && x <= 8) return PALETTE.waterFoam;
    if (y === 5 && x >= 4 && x <= 9) return PALETTE.waterLight;
    if (y === 11 && x >= 9 && x <= 14) return PALETTE.waterFoam;
    if (y === 12 && x >= 8 && x <= 13) return PALETTE.waterLight;
    if ((x + y) % 6 === 0) return PALETTE.waterDeep;
    return PALETTE.waterBase;
  });
}

// 5. Water 1 (calm pond frame 2, ripples shifted)
function makeWater1(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Ripples shifted
    if (y === 4 && x >= 7 && x <= 12) return PALETTE.waterFoam;
    if (y === 5 && x >= 8 && x <= 13) return PALETTE.waterLight;
    if (y === 11 && x >= 2 && x <= 7) return PALETTE.waterFoam;
    if (y === 12 && x >= 3 && x <= 8) return PALETTE.waterLight;
    if ((x + y + 2) % 6 === 0) return PALETTE.waterDeep;
    return PALETTE.waterBase;
  });
}

// 6. Wooden floor
function makeWoodenFloor(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Plank horizontal seams every 4 lines (y=0, 4, 8, 12)
    if (y % 4 === 0) return PALETTE.brownDarkest;
    // Staggered vertical plank joints
    const plankRow = Math.floor(y / 4);
    const jointX = (plankRow * 6) % 16;
    if (x === jointX) return PALETTE.brownDarkest;
    if (y % 4 === 1) return PALETTE.brownPale;
    if ((x + y) % 5 === 0) return PALETTE.brownLight;
    return PALETTE.brownMid;
  });
}

// 7. Wall (cozy log wall)
function makeWall(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Log separators
    if (y % 5 === 0) return PALETTE.brownDarkest;
    if (y % 5 === 1) return PALETTE.brownPale;
    if (x === 0 || x === 15) return PALETTE.brownDark;
    return PALETTE.brownBase;
  });
}

// 8. Door
function makeDoor(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Door frame
    if (x <= 1 || x >= 14 || y <= 1) return PALETTE.brownDarkest;
    // Door handle at (12, 9)
    if ((x === 11 || x === 12) && (y === 9 || y === 10)) return PALETTE.starGold;
    // Door panels
    if (x === 7 || y === 7) return PALETTE.brownDark;
    if (y % 2 === 0) return PALETTE.brownLight;
    return PALETTE.brownMid;
  });
}

// 9. Tree trunk
function makeTreeTrunk(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    if (x < 3 || x > 12) return TRANSPARENT;
    if (x === 3 || x === 12) return PALETTE.brownDarkest;
    if (x === 6 || x === 10) return PALETTE.brownDark;
    if (x === 7) return PALETTE.brownPale;
    return PALETTE.brownBase;
  });
}

// 10. Tree canopy (32×32 crisp leafy treetop)
function makeTreeCanopy(): Texture {
  return createProceduralTexture(32, 32, (x, y) => {
    const cx = 15.5;
    const cy = 15.5;
    const dx = x - cx;
    const dy = y - cy;
    const distSq = dx * dx + dy * dy;

    // Radius ~ 14 with bumpy foliage outline
    const angle = Math.atan2(dy, dx);
    const wobble = Math.sin(angle * 7) * 1.5;
    const maxR = 13.5 + wobble;

    if (distSq > maxR * maxR) return TRANSPARENT;
    if (distSq > (maxR - 1.5) * (maxR - 1.5)) return PALETTE.greenDarkest;
    if (distSq > (maxR - 3.5) * (maxR - 3.5)) return PALETTE.greenDark;

    // Top-left highlight, bottom-right shadow
    if (dx + dy < -6 && distSq < 9 * 9) return PALETTE.greenSprout;
    if (dx + dy < 0) return PALETTE.greenLight;
    if (dx + dy > 8) return PALETTE.greenDark;
    return PALETTE.greenBase;
  });
}

// 11. Log seat
function makeLogSeat(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const rSq = dx * dx + dy * dy;
    if (rSq > 6.5 * 6.5) return TRANSPARENT;
    if (rSq > 5.2 * 5.2) return PALETTE.brownDarkest;
    // Tree ring
    if (rSq > 2.8 * 2.8 && rSq < 3.8 * 3.8) return PALETTE.brownMid;
    if (rSq <= 1.2 * 1.2) return PALETTE.brownDark;
    return PALETTE.brownPale;
  });
}

// 12. Stool
function makeStool(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Legs
    if (y >= 10 && (x === 4 || x === 11 || x === 7)) return PALETTE.brownDark;
    // Seat top
    if (y >= 4 && y <= 9 && x >= 3 && x <= 12) {
      if (y === 4) return PALETTE.brownPale;
      if (y === 9 || x === 3 || x === 12) return PALETTE.brownDarkest;
      return PALETTE.brownLight;
    }
    return TRANSPARENT;
  });
}

// 13. Bench
function makeBench(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Legs
    if (y >= 11 && y <= 15 && (x === 2 || x === 3 || x === 12 || x === 13)) {
      return PALETTE.brownDarkest;
    }
    // Wooden slats
    if (y >= 5 && y <= 10 && x >= 1 && x <= 14) {
      if (y === 5) return PALETTE.brownPale;
      if (y === 7 || y === 10) return PALETTE.brownDark;
      return PALETTE.brownLight;
    }
    return TRANSPARENT;
  });
}

// 14. Campfire
function makeCampfire(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    const dx = x - 7.5;
    const dy = y - 8.5;
    const rSq = dx * dx + dy * dy;

    // Fire flame in center
    if (y >= 3 && y <= 9 && Math.abs(x - 7.5) <= (9 - y) * 0.7) {
      if (y >= 6 && Math.abs(x - 7.5) <= 1) return PALETTE.warmWhite;
      if (y >= 5 && Math.abs(x - 7.5) <= 2) return PALETTE.orangeLight;
      return PALETTE.orangeBright;
    }

    // Wood logs criss-crossed
    if (
      (Math.abs(dx - dy) <= 1 && rSq <= 5.5 * 5.5) ||
      (Math.abs(dx + dy) <= 1 && rSq <= 5.5 * 5.5)
    ) {
      return PALETTE.brownBase;
    }

    // Stone ring around fire
    if (rSq >= 4.5 * 4.5 && rSq <= 7.2 * 7.2) {
      if ((x + y) % 3 === 0) return PALETTE.stoneLight;
      if ((x * 2 + y) % 5 === 0) return PALETTE.stoneDark;
      return PALETTE.stoneMid;
    }

    return TRANSPARENT;
  });
}

// 15. Pier planks
function makePierPlanks(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Vertical wood planks with edge over water
    if (x % 4 === 0) return PALETTE.brownDarkest;
    if (x % 4 === 1) return PALETTE.brownPale;
    // Nails at top and bottom
    if ((y === 2 || y === 13) && (x % 4 === 2)) return PALETTE.stoneDark;
    if (y >= 14) return PALETTE.waterBase;
    return PALETTE.brownLight;
  });
}

// 16. Rug
function makeRug(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Fringe on top and bottom
    if ((y === 1 || y === 14) && x >= 2 && x <= 13) {
      return x % 2 === 0 ? PALETTE.warmWhite : TRANSPARENT;
    }
    if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
      // Border
      if (x === 2 || x === 13 || y === 2 || y === 13) return PALETTE.orangeDark;
      // Diamond motif
      const dx = Math.abs(x - 7.5);
      const dy = Math.abs(y - 7.5);
      if (dx + dy <= 3) return PALETTE.orangeBright;
      if (dx + dy <= 4) return PALETTE.starGold;
      return PALETTE.brownLight;
    }
    return TRANSPARENT;
  });
}

// 17. Flower tile
function makeFlower(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Cute blossom
    const dx = x - 7.5;
    const dy = y - 7.5;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 1.2) return PALETTE.starGold; // Center
    if (distSq <= 4.5) return PALETTE.heartRed; // Petals
    if (y >= 10 && y <= 14 && (x === 7 || x === 8)) return PALETTE.greenMid; // Stem
    if (y === 12 && (x === 6 || x === 9)) return PALETTE.greenSprout; // Leaf
    return TRANSPARENT;
  });
}

// 18. Character Base (16×16 cute chibi sprite)
function makeCharBase(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Head (y: 2..8, x: 4..11)
    if (y >= 2 && y <= 8 && x >= 4 && x <= 11) {
      // Hair outline
      if (y === 2 || ((x === 4 || x === 11) && y <= 5)) return PALETTE.brownDarkest;
      // Eyes at (6, 5) and (9, 5)
      if (y === 5 && (x === 6 || x === 9)) return PALETTE.brownDarkest;
      // Cheeks at (5, 6) and (10, 6)
      if (y === 6 && (x === 5 || x === 10)) return PALETTE.blushRed;
      return PALETTE.skinTone;
    }
    // Body / Tunic (y: 9..12, x: 4..11)
    if (y >= 9 && y <= 12 && x >= 4 && x <= 11) {
      if (x === 4 || x === 11 || y === 12) return PALETTE.greenDark;
      return PALETTE.greenBase;
    }
    // Boots (y: 13..15, x: 5..6 & 9..10)
    if (y >= 13 && y <= 15 && ((x >= 5 && x <= 6) || (x >= 9 && x <= 10))) {
      return PALETTE.brownDarkest;
    }
    return TRANSPARENT;
  });
}

// 18b. Character Clothing Layer (16×16 white tunic ready for tinting)
function makeCharClothing(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Body / Tunic (y: 9..12, x: 4..11)
    if (y >= 9 && y <= 12 && x >= 4 && x <= 11) {
      if (x === 4 || x === 11 || y === 12) return [200, 200, 200, 255];
      return [255, 255, 255, 255];
    }
    return TRANSPARENT;
  });
}

// Hats
function makeHatNone(): Texture {
  return createProceduralTexture(16, 16, () => TRANSPARENT);
}

function makeHatBeanie(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Pom-pom at top
    if (y === 1 && (x === 7 || x === 8)) return PALETTE.warmWhite;
    // Beanie dome
    if (y >= 2 && y <= 5 && x >= 4 && x <= 11) {
      if (y === 2 && (x === 4 || x === 11)) return TRANSPARENT;
      return PALETTE.orangeBright;
    }
    // Folded brim
    if (y === 6 && x >= 3 && x <= 12) {
      return PALETTE.orangeDark;
    }
    return TRANSPARENT;
  });
}

function makeHatCap(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Crown
    if (y >= 2 && y <= 5 && x >= 5 && x <= 11) {
      if (y === 2 && (x === 5 || x === 11)) return TRANSPARENT;
      return PALETTE.greenDark;
    }
    // Visor / Brim
    if (y === 6 && x >= 3 && x <= 11) {
      return PALETTE.greenBase;
    }
    return TRANSPARENT;
  });
}

function makeHatFlower(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Worn flower on head side (x: 10..13, y: 2..5)
    const dx = x - 11.5;
    const dy = y - 3.5;
    if (dx * dx + dy * dy <= 1.2) return PALETTE.starGold;
    if (dx * dx + dy * dy <= 4.2) return PALETTE.heartLight;
    if (y === 5 && x === 10) return PALETTE.greenSprout;
    return TRANSPARENT;
  });
}

// Emotes (all 6 EmoteIds)
function makeEmoteWave(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Hand palm and fingers
    if (y >= 4 && y <= 11 && x >= 5 && x <= 11) {
      if (y === 4 && (x === 5 || x === 7 || x === 9 || x === 11)) return PALETTE.skinTone;
      if (y >= 5 && y <= 10) return PALETTE.skinTone;
      if (y === 11 && x >= 6 && x <= 10) return PALETTE.skinShadow;
    }
    // Wave motion arcs
    if ((x === 2 || x === 14) && (y >= 5 && y <= 9)) return PALETTE.waterLight;
    if ((x === 3 || x === 13) && (y === 4 || y === 10)) return PALETTE.waterLight;
    return TRANSPARENT;
  });
}

function makeEmoteHeart(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Crisp pixel heart
    const inHeart =
      (y === 4 && ((x >= 4 && x <= 6) || (x >= 9 && x <= 11))) ||
      (y === 5 && x >= 3 && x <= 12) ||
      (y === 6 && x >= 3 && x <= 12) ||
      (y === 7 && x >= 4 && x <= 11) ||
      (y === 8 && x >= 5 && x <= 10) ||
      (y === 9 && x >= 6 && x <= 9) ||
      (y === 10 && x >= 7 && x <= 8);

    if (inHeart) {
      // Shine highlight at (5, 5)
      if ((x === 5 && y === 5) || (x === 4 && y === 5)) return PALETTE.warmWhite;
      return PALETTE.heartRed;
    }
    return TRANSPARENT;
  });
}

function makeEmoteSmile(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    if (dx * dx + dy * dy <= 6 * 6) {
      // Outline edge
      if (dx * dx + dy * dy >= 5 * 5) return PALETTE.orangeDark;
      // Eyes
      if ((x === 5 || x === 10) && (y === 6 || y === 7)) return PALETTE.brownDarkest;
      // Blush
      if ((x === 4 || x === 11) && y === 8) return PALETTE.blushRed;
      // Smile curve
      if (y === 10 && x >= 6 && x <= 9) return PALETTE.brownDarkest;
      if (y === 9 && (x === 5 || x === 10)) return PALETTE.brownDarkest;
      return PALETTE.starGold;
    }
    return TRANSPARENT;
  });
}

function makeEmoteSparkle(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // 4-pointed golden sparkle star
    const dx = Math.abs(x - 7.5);
    const dy = Math.abs(y - 7.5);
    if ((dx === 0 && dy <= 6) || (dy === 0 && dx <= 6)) return PALETTE.starGold;
    if (dx <= 1 && dy <= 1) return PALETTE.warmWhite;
    if (dx + dy <= 3) return PALETTE.starLight;
    // Secondary tiny sparkle
    if ((x === 13 && y === 3) || (x === 3 && y === 13)) return PALETTE.starGold;
    return TRANSPARENT;
  });
}

function makeEmoteMusic(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Beam connecting two notes
    if (y === 4 && x >= 5 && x <= 12) return PALETTE.musicPurple;
    // Note stems
    if (x === 5 && y >= 4 && y <= 10) return PALETTE.musicPurple;
    if (x === 12 && y >= 4 && y <= 9) return PALETTE.musicPurple;
    // Note heads
    if ((y === 10 || y === 11) && x >= 3 && x <= 6) return PALETTE.musicLight;
    if ((y === 9 || y === 10) && x >= 10 && x <= 13) return PALETTE.musicLight;
    return TRANSPARENT;
  });
}

function makeEmoteZzz(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Big Z at top right (x: 8..13, y: 3..7)
    const inBigZ =
      (y === 3 && x >= 8 && x <= 13) ||
      (y === 4 && x === 12) ||
      (y === 5 && x === 10) ||
      (y === 6 && x === 9) ||
      (y === 7 && x >= 8 && x <= 13);
    if (inBigZ) return PALETTE.zzzLavender;

    // Small z at bottom left (x: 3..7, y: 9..13)
    const inSmallZ =
      (y === 9 && x >= 3 && x <= 7) ||
      (y === 10 && x === 6) ||
      (y === 11 && x === 5) ||
      (y === 12 && x === 4) ||
      (y === 13 && x >= 3 && x <= 7);
    if (inSmallZ) return PALETTE.musicLight;

    return TRANSPARENT;
  });
}

// Status icons
function makeStatusBook(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Open book (Pomodoro focus)
    if (y >= 4 && y <= 12 && x >= 2 && x <= 13) {
      // Leather spine & cover edge
      if (x === 2 || x === 13 || y === 12) return PALETTE.brownDarkest;
      // Central binding
      if (x === 7 || x === 8) return PALETTE.brownBase;
      // Text lines on parchment
      if ((y === 6 || y === 8 || y === 10) && x !== 7 && x !== 8) {
        if (x % 2 === 0) return PALETTE.stoneDark;
      }
      return PALETTE.warmWhite;
    }
    return TRANSPARENT;
  });
}

function makeStatusCoffeeCup(): Texture {
  return createProceduralTexture(16, 16, (x, y) => {
    // Steam swirls
    if (y <= 3) {
      if (
        (y === 1 && (x === 6 || x === 9)) ||
        (y === 2 && (x === 7 || x === 10)) ||
        (y === 3 && (x === 6 || x === 9))
      ) {
        return PALETTE.warmWhite;
      }
      return TRANSPARENT;
    }
    // Cup body
    if (y >= 5 && y <= 12 && x >= 4 && x <= 11) {
      if (y === 5) return PALETTE.brownDarkest; // coffee surface
      return PALETTE.orangeBase;
    }
    // Handle
    if (y >= 7 && y <= 10 && (x === 12 || x === 13)) {
      return PALETTE.orangeBase;
    }
    // Saucer
    if (y === 13 && x >= 3 && x <= 12) return PALETTE.orangeDark;
    return TRANSPARENT;
  });
}

// Tileset forest placeholder (compiled 64×64 texture of tiles)
function makeTilesetForest(): Texture {
  return createProceduralTexture(64, 64, (x, y) => {
    // 4x4 grid of 16x16 tiles
    const tileCol = Math.floor(x / 16);
    const tileRow = Math.floor(y / 16);
    const tx = x % 16;
    const ty = y % 16;

    if (tileRow === 0 && tileCol === 0) {
      return (tx + ty * 7) % 11 === 0 ? PALETTE.greenLight : PALETTE.greenBase;
    }
    if (tileRow === 0 && tileCol === 1) {
      return (tx * 7 + ty * 13) % 19 === 0 ? PALETTE.brownPale : PALETTE.brownMid;
    }
    if (tileRow === 1 && tileCol === 0) {
      return (tx + ty) % 6 === 0 ? PALETTE.waterDeep : PALETTE.waterBase;
    }
    if (tileRow === 1 && tileCol === 1) {
      return ty % 4 === 0 ? PALETTE.brownDarkest : PALETTE.brownMid;
    }
    return (tx + ty) % 2 === 0 ? PALETTE.greenBase : PALETTE.brownMid;
  });
}

type TextureFactory = () => Texture;

const GENERAL_FACTORIES: Record<string, TextureFactory> = {
  char_base: makeCharBase,
  char_clothing: makeCharClothing,
  tileset_forest: makeTilesetForest,
  smile: makeEmoteSmile,
};

const TILE_FACTORIES: Record<string, TextureFactory> = {
  grass_0: makeGrass0,
  grass_1: makeGrass1,
  dirt_path: makeDirtPath,
  water_0: makeWater0,
  water_1: makeWater1,
  wooden_floor: makeWoodenFloor,
  wall: makeWall,
  door: makeDoor,
  tree_trunk: makeTreeTrunk,
  tree_canopy: makeTreeCanopy,
  log_seat: makeLogSeat,
  stool: makeStool,
  bench: makeBench,
  campfire: makeCampfire,
  pier_planks: makePierPlanks,
  rug: makeRug,
  flower: makeFlower,
};

const HAT_FACTORIES: Record<string, TextureFactory> = {
  none: makeHatNone,
  beanie: makeHatBeanie,
  cap: makeHatCap,
  flower: makeHatFlower,
};

const EMOTE_FACTORIES: Record<string, TextureFactory> = {
  heart: makeEmoteHeart,
  coffee: makeStatusCoffeeCup,
  music: makeEmoteMusic,
  wave: makeEmoteWave,
  zzz: makeEmoteZzz,
  sparkle: makeEmoteSparkle,
};

const STATUS_FACTORIES: Record<string, TextureFactory> = {
  book: makeStatusBook,
  coffee_cup: makeStatusCoffeeCup,
  coffee: makeStatusCoffeeCup,
};

// Lazy memoization cache
const placeholderCache = new Map<string, Texture>();

export function getHatPlaceholder(id: HatId | string): Texture | undefined {
  const norm = id.startsWith('hat_') ? id.slice(4) : id;
  const factory = HAT_FACTORIES[norm];
  if (!factory) return undefined;
  const cacheKey = `hat_${norm}`;
  if (!placeholderCache.has(cacheKey)) {
    placeholderCache.set(cacheKey, factory());
  }
  return placeholderCache.get(cacheKey)!;
}

export function getEmotePlaceholder(id: EmoteId | string): Texture | undefined {
  const norm = id.startsWith('emote_') ? id.slice(6) : id;
  const factory = EMOTE_FACTORIES[norm];
  if (!factory) return undefined;
  const cacheKey = `emote_${norm}`;
  if (!placeholderCache.has(cacheKey)) {
    placeholderCache.set(cacheKey, factory());
  }
  return placeholderCache.get(cacheKey)!;
}

export function getTilePlaceholder(tileId: string | number): Texture {
  if (typeof tileId === 'number') {
    const tileKeys = [
      'grass_0',
      'grass_1',
      'dirt_path',
      'water_0',
      'water_1',
      'wooden_floor',
      'wall',
      'door',
      'tree_trunk',
      'tree_canopy',
      'log_seat',
      'stool',
      'bench',
      'campfire',
      'pier_planks',
      'rug',
      'flower',
    ];
    const key = tileKeys[tileId % tileKeys.length];
    return getTilePlaceholder(key);
  }

  const norm = tileId.startsWith('tile_') ? tileId.slice(5) : tileId;
  const cacheKey = `tile_${norm}`;
  if (placeholderCache.has(cacheKey)) {
    return placeholderCache.get(cacheKey)!;
  }
  const factory = TILE_FACTORIES[norm];
  if (factory) {
    const tex = factory();
    placeholderCache.set(cacheKey, tex);
    return tex;
  }
  return getTilePlaceholder('grass_0');
}

export function getPlaceholderTexture(key: string): Texture {
  if (placeholderCache.has(key)) {
    return placeholderCache.get(key)!;
  }

  // 1. General factories (char_base, tileset_forest)
  if (GENERAL_FACTORIES[key]) {
    const tex = GENERAL_FACTORIES[key]();
    placeholderCache.set(key, tex);
    return tex;
  }

  // 2. Status icons (book, coffee_cup, coffee)
  if (STATUS_FACTORIES[key]) {
    const tex = STATUS_FACTORIES[key]();
    placeholderCache.set(key, tex);
    return tex;
  }

  // 3. Tile factories
  if (TILE_FACTORIES[key]) {
    const tex = TILE_FACTORIES[key]();
    placeholderCache.set(key, tex);
    return tex;
  }

  // 4. Prefixed or specific lookups
  if (key === 'hat_flower' || key.startsWith('hat_')) {
    const hat = getHatPlaceholder(key);
    if (hat) return hat;
  }
  if (key.startsWith('emote_')) {
    const emote = getEmotePlaceholder(key);
    if (emote) return emote;
  }
  if (key.startsWith('tile_')) {
    return getTilePlaceholder(key);
  }
  if (key.startsWith('status_')) {
    const sub = key.slice(7);
    if (STATUS_FACTORIES[sub]) {
      return getPlaceholderTexture(sub);
    }
  }

  // 5. Emote by ID (wave, heart, etc.)
  if (EMOTE_FACTORIES[key]) {
    const emote = getEmotePlaceholder(key);
    if (emote) return emote;
  }

  // 6. Hat by ID (none, beanie, cap; flower handled earlier)
  if (HAT_FACTORIES[key]) {
    const hat = getHatPlaceholder(key);
    if (hat) return hat;
  }

  // Default fallback
  return getPlaceholderTexture('grass_0');
}

// Backward-compatible lazy access proxy
export const PLACEHOLDER_TEXTURES: Record<string, Texture> = new Proxy(
  {} as Record<string, Texture>,
  {
    get(_target, prop: string) {
      if (prop === 'hat_flower') return getHatPlaceholder('flower')!;
      return getPlaceholderTexture(prop);
    },
    has(_target, prop: string) {
      return Boolean(
        GENERAL_FACTORIES[prop] ||
          TILE_FACTORIES[prop] ||
          HAT_FACTORIES[prop] ||
          EMOTE_FACTORIES[prop] ||
          STATUS_FACTORIES[prop] ||
          prop === 'hat_flower'
      );
    },
  }
);
