import { describe, it, expect, vi } from 'vitest';
import { applyPomoPhaseEffects } from './game';

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
