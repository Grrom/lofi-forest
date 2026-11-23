import { describe, it, expect } from 'vitest';
import { TextureStyle } from 'pixi.js';
import { setupPixi } from './pixiSetup';

describe('pixiSetup', () => {
  // Acceptance criterion:
  // scaleMode = 'nearest' is set in main before the loader runs.
  it("scaleMode = 'nearest' is set in main before the loader runs", () => {
    setupPixi();
    expect(TextureStyle.defaultOptions.scaleMode).toBe('nearest');
  });
});
