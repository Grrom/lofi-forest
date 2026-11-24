import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlayerAvatar } from './PlayerAvatar';
import { StorageManager } from '../systems/StorageManager';
import { assetLoader } from '../engine/assets/AssetLoader';
import { Graphics, Sprite, Text } from 'pixi.js';

describe('PlayerAvatar', () => {
  beforeEach(() => {
    StorageManager.reset();
  });

  afterEach(() => {
    StorageManager.reset();
  });

  // Acceptance criterion:
  // Test: setStatus('focus') shows the book icon; setStatus('none') hides it.
  it("setStatus('focus') shows the book icon; setStatus('none') hides it", () => {
    const avatar = new PlayerAvatar({ status: 'none' });
    expect(avatar.statusSprite.visible).toBe(false);
    expect(avatar.statusContainer.visible).toBe(false);

    // Call setStatus('focus') -> shows book icon
    avatar.setStatus('focus');
    expect(avatar.status).toBe('focus');
    expect(avatar.statusSprite.visible).toBe(true);
    expect(avatar.statusContainer.visible).toBe(true);
    expect(avatar.statusSprite.texture).toBe(assetLoader.getTextureSync('book'));

    // Call setStatus('none') -> hides it
    avatar.setStatus('none');
    expect(avatar.status).toBe('none');
    expect(avatar.statusSprite.visible).toBe(false);
    expect(avatar.statusContainer.visible).toBe(false);

    // Call setStatus('break') -> shows coffee icon
    avatar.setStatus('break');
    expect(avatar.status).toBe('break');
    expect(avatar.statusSprite.visible).toBe(true);
    expect(avatar.statusContainer.visible).toBe(true);
    expect(avatar.statusSprite.texture).toBe(assetLoader.getTextureSync('coffee'));

    avatar.destroy();
  });

  it('renders required layers in proper order: shadow, baseSprite, hatLayer, clothingLayer', () => {
    const avatar = new PlayerAvatar({
      outfit: { baseId: 'char_base', hatId: 'beanie', colorHex: '#4a7c59' },
    });

    expect(avatar.shadow).toBeInstanceOf(Graphics);
    expect(avatar.baseSprite).toBeInstanceOf(Sprite);
    expect(avatar.hatLayer).toBeInstanceOf(Sprite);
    expect(avatar.clothingLayer).toBeInstanceOf(Sprite);
    expect(avatar.nameplate).toBeInstanceOf(Text);

    // Verify container child hierarchy
    expect(avatar.children[0]).toBe(avatar.shadow);
    expect(avatar.children[1]).toBe(avatar.baseSprite);
    expect(avatar.children[2]).toBe(avatar.hatLayer);
    expect(avatar.children[3]).toBe(avatar.clothingLayer);

    // Hat layer visible with beanie
    expect(avatar.hatLayer.visible).toBe(true);

    avatar.destroy();
  });

  it('setOutfit() updates hat visibility, texture and clothing tint', () => {
    const avatar = new PlayerAvatar({
      outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
    });

    expect(avatar.hatLayer.visible).toBe(false);

    avatar.setOutfit({
      baseId: 'char_base',
      hatId: 'cap',
      colorHex: '#c2410c',
    });

    expect(avatar.outfit.hatId).toBe('cap');
    expect(avatar.hatLayer.visible).toBe(true);
    expect(avatar.outfit.colorHex).toBe('#c2410c');

    avatar.destroy();
  });

  it('PlayerAvatar with default StorageManager prefs renders char_base texture and preserves it on setOutfit', () => {
    // new PlayerAvatar() with default StorageManager prefs (where outfit.baseId === 'default')
    const avatar = new PlayerAvatar();
    expect(avatar.baseSprite.texture).toBe(assetLoader.getTextureSync('char_base'));

    // setOutfit with default outfit and new hat should keep char_base texture
    avatar.setOutfit({
      ...StorageManager.get().profile.outfit,
      hatId: 'cap',
    });
    expect(avatar.baseSprite.texture).toBe(assetLoader.getTextureSync('char_base'));
    expect(avatar.hatLayer.visible).toBe(true);

    avatar.destroy();
  });

  it('setFacing() mirrors base, clothing, and hat layers', () => {
    const avatar = new PlayerAvatar();

    avatar.setFacing('left');
    expect(avatar.baseSprite.scale.x).toBeLessThan(0);
    expect(avatar.clothingLayer.scale.x).toBeLessThan(0);
    expect(avatar.hatLayer.scale.x).toBeLessThan(0);

    avatar.setFacing('right');
    expect(avatar.baseSprite.scale.x).toBeGreaterThan(0);
    expect(avatar.clothingLayer.scale.x).toBeGreaterThan(0);
    expect(avatar.hatLayer.scale.x).toBeGreaterThan(0);

    avatar.destroy();
  });

  it('setName() updates nameplate and respects showNames', () => {
    const avatar = new PlayerAvatar({ name: 'Wanderer', showNames: true });
    expect(avatar.nameplate.text).toBe('Wanderer');
    expect(avatar.nameplate.visible).toBe(true);

    // Hide names
    avatar.setShowNames(false);
    expect(avatar.nameplate.visible).toBe(false);

    // Show names again
    avatar.setShowNames(true);
    expect(avatar.nameplate.visible).toBe(true);

    // Setting null name hides nameplate
    avatar.setName(null);
    expect(avatar.nameplate.visible).toBe(false);

    avatar.destroy();
  });

  it('celebrate() triggers 3 s bounce animation and returns to previous action', () => {
    const avatar = new PlayerAvatar({ action: 'idle' });
    expect(avatar.action).toBe('idle');

    const start = 10000;
    vi.spyOn(Date, 'now').mockReturnValue(start);

    avatar.celebrate();
    expect(avatar.action).toBe('celebrate');

    // Midway through celebrate (1500 ms elapsed)
    avatar.update(0.016, start + 1500);
    expect(avatar.action).toBe('celebrate');

    // After 3000 ms elapsed, reverts to previous action ('idle')
    avatar.update(0.016, start + 3001);
    expect(avatar.action).toBe('idle');

    avatar.destroy();
  });
});
