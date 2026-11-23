import { TextureStyle } from 'pixi.js';

export function setupPixi(): void {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
}

// Call immediately on module load so nearest-neighbor is guaranteed
setupPixi();
