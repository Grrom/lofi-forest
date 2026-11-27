import { describe, it, expect, vi } from 'vitest';
import { applyPomoPhaseEffects, GameEngine } from './game';
import { LocalPlayer } from '../entities/LocalPlayer';

describe('applyPomoPhaseEffects', () => {
  it('focus -> break celebrates, pulses glow, and turns vignette off', () => {
    const celebrate = vi.fn();
    const pulseGlow = vi.fn();
    const setVignette = vi.fn();

    applyPomoPhaseEffects('focus', 'break', {
      player: { celebrate },
      atmosphere: { pulseGlow, setVignette },
    });

    expect(setVignette).toHaveBeenCalledWith(false);
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(pulseGlow).toHaveBeenCalledTimes(1);
  });

  it('break -> focus turns vignette on without celebrate or pulseGlow', () => {
    const celebrate = vi.fn();
    const pulseGlow = vi.fn();
    const setVignette = vi.fn();

    applyPomoPhaseEffects('break', 'focus', {
      player: { celebrate },
      atmosphere: { pulseGlow, setVignette },
    });

    expect(setVignette).toHaveBeenCalledWith(true);
    expect(celebrate).not.toHaveBeenCalled();
    expect(pulseGlow).not.toHaveBeenCalled();
  });

  it('none -> focus turns vignette on', () => {
    const celebrate = vi.fn();
    const pulseGlow = vi.fn();
    const setVignette = vi.fn();

    applyPomoPhaseEffects('none', 'focus', {
      player: { celebrate },
      atmosphere: { pulseGlow, setVignette },
    });

    expect(setVignette).toHaveBeenCalledWith(true);
    expect(celebrate).not.toHaveBeenCalled();
    expect(pulseGlow).not.toHaveBeenCalled();
  });

  it('focus -> none turns vignette off without celebrate or pulseGlow', () => {
    const celebrate = vi.fn();
    const pulseGlow = vi.fn();
    const setVignette = vi.fn();

    applyPomoPhaseEffects('focus', 'none', {
      player: { celebrate },
      atmosphere: { pulseGlow, setVignette },
    });

    expect(setVignette).toHaveBeenCalledWith(false);
    expect(celebrate).not.toHaveBeenCalled();
    expect(pulseGlow).not.toHaveBeenCalled();
  });
});

describe('GameEngine setupSession', () => {
  it('spectator mode creates no local avatar, parks camera on zone focus, and NetSync has no local player', async () => {
    const engine = new GameEngine();
    await engine.setupSession({
      spectator: true,
      zone: 'pub',
      hideNames: true,
      overlay: true,
      focusMin: 50,
      breakMin: 10,
    });

    expect(engine.isSpectator).toBe(true);
    expect(engine.player).toBeUndefined();
    expect(engine.camera.target).toBeDefined();
    expect(engine.camera.target?.zone).toBe('pub');
    expect((engine.netSync as any).localPlayer).toBeUndefined();

    engine.destroy();
  });

  it('normal mode creates a LocalPlayer avatar and links it to NetSync', async () => {
    const engine = new GameEngine();
    await engine.setupSession({
      spectator: false,
      zone: 'forest',
      hideNames: false,
      overlay: false,
      focusMin: 50,
      breakMin: 10,
    });

    expect(engine.isSpectator).toBe(false);
    expect(engine.player).toBeDefined();
    expect(engine.player).toBeInstanceOf(LocalPlayer);
    expect((engine.netSync as any).localPlayer).toBe(engine.player);

    engine.destroy();
  });

  it('transport passed to setTransport before setupSession is the one NetSync ends up using', async () => {
    const engine = new GameEngine();
    const mockTransport: any = {
      mode: 'p2p',
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      sendLocalState: vi.fn(),
      sendEmote: vi.fn(),
      onPlayersChange: vi.fn(() => vi.fn()),
      onEmote: vi.fn(() => vi.fn()),
      onStatusChange: vi.fn(() => vi.fn()),
    };

    await engine.setTransport(mockTransport);

    // Prior to setupSession, player is undefined, so transport is not yet set
    expect(engine.transport).toBeUndefined();

    await engine.setupSession({
      spectator: false,
      zone: 'forest',
      hideNames: false,
      overlay: false,
      focusMin: 50,
      breakMin: 10,
    });

    expect(engine.transport).toBe(mockTransport);
    expect(engine.netSync?.transport).toBe(mockTransport);
    expect(mockTransport.connect).toHaveBeenCalled();

    engine.destroy();
  });
});
