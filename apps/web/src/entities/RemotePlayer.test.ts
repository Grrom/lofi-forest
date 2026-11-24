import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemotePlayer } from './RemotePlayer';
import type { PlayerNetState } from '@lofi/shared';
import { StorageManager } from '../systems/StorageManager';
import { assetLoader } from '../engine/assets/AssetLoader';

describe('RemotePlayer', () => {
  beforeEach(() => {
    StorageManager.reset();
  });

  afterEach(() => {
    StorageManager.reset();
    vi.restoreAllMocks();
  });

  it('initializes avatar properties from PlayerNetState', () => {
    const state: PlayerNetState = {
      id: 'remote-1',
      name: 'ForestFriend',
      x: 150,
      y: 200,
      zone: 'forest',
      facing: 'left',
      action: 'sit',
      outfit: { baseId: 'char_base', hatId: 'beanie', colorHex: '#2563eb' },
      pomo: 'focus',
    };

    const rp = new RemotePlayer(state);

    expect(rp.id).toBe('remote-1');
    expect(rp.zone).toBe('forest');
    expect(rp.x).toBe(150);
    expect(rp.y).toBe(200);
    expect(rp.facing).toBe('left');
    expect(rp.action).toBe('sit');
    expect(rp.nameplate.text).toBe('ForestFriend');
    expect(rp.status).toBe('focus');
    expect(rp.statusSprite.visible).toBe(true);

    rp.destroy();
  });

  it('updateState updates buffer and visual avatar properties', () => {
    const state: PlayerNetState = {
      id: 'remote-2',
      name: 'InitialName',
      x: 10,
      y: 20,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
      outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
      pomo: 'none',
    };

    const rp = new RemotePlayer(state);

    const updatedState: PlayerNetState = {
      ...state,
      name: 'NewName',
      x: 50,
      y: 60,
      zone: 'pub',
      facing: 'right',
      action: 'walk',
      outfit: { baseId: 'char_base', hatId: 'cap', colorHex: '#ef4444' },
      pomo: 'break',
    };

    rp.updateState(updatedState, 1000);

    expect(rp.nameplate.text).toBe('NewName');
    expect(rp.zone).toBe('pub');
    expect(rp.action).toBe('walk');
    expect(rp.facing).toBe('right');
    expect(rp.outfit.hatId).toBe('cap');
    expect(rp.status).toBe('break');

    rp.destroy();
  });

  it('update samples the interpolation buffer to update position', () => {
    const state: PlayerNetState = {
      id: 'remote-3',
      name: 'Walker',
      x: 0,
      y: 0,
      zone: 'forest',
      facing: 'right',
      action: 'walk',
      outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
      pomo: 'none',
    };

    const rp = new RemotePlayer(state);
    rp.buffer.clear();
    rp.buffer.push({ t: 0, x: 0, y: 0 });
    rp.buffer.push({ t: 100, x: 100, y: 0 });

    // With INTERP_DELAY_MS = 140, now = 190 -> renderTime = 50 -> x=50, y=0
    rp.update(0.016, 190);

    expect(rp.x).toBe(50);
    expect(rp.y).toBe(0);
    expect(rp.position.x).toBe(50);
    expect(rp.position.y).toBe(0);

    rp.destroy();
  });
});
