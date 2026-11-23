import { describe, it, expect } from 'vitest';
import { TextureStyle } from 'pixi.js';
import { setupPixi } from './pixiSetup';
import { getPlaceholderTexture } from './assets/placeholders';

describe('pixiSetup', () => {
  // Acceptance criterion:
  // scaleMode = 'nearest' is set in main before the loader runs.
  it("scaleMode = 'nearest' is set in main before the loader runs", () => {
    setupPixi();
    expect(TextureStyle.defaultOptions.scaleMode).toBe('nearest');
    // Lazy placeholder texture created after setupPixi inherits 'nearest' scaleMode
    const grassTex = getPlaceholderTexture('grass_0');
    expect(grassTex.source.style.scaleMode).toBe('nearest');
  });
});
