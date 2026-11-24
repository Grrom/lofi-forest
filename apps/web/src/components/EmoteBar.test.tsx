import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmoteBar, resetStandaloneEmoteCooldown } from './EmoteBar';
import { gameEvents } from '../engine/events';
import { gameEngine } from '../engine/game';
import { LocalPlayer } from '../entities/LocalPlayer';
import { EMOTE_IDS } from '@lofi/shared';

describe('EmoteBar (bottom bar)', () => {
  beforeEach(() => {
    resetStandaloneEmoteCooldown();
    gameEvents.removeAllListeners();
    (gameEngine as any).player = undefined;
  });

  afterEach(() => {
    resetStandaloneEmoteCooldown();
    gameEvents.removeAllListeners();
    (gameEngine as any).player = undefined;
    vi.restoreAllMocks();
  });

  it('renders all 6 preset emotes from EMOTE_IDS with hotkeys 1-6', () => {
    render(<EmoteBar />);

    for (const emoteId of EMOTE_IDS) {
      const btn = screen.getByRole('button', { name: new RegExp(`emote ${emoteId}`, 'i') });
      expect(btn).toBeDefined();
    }

    // Verify hotkey text displays 1 through 6
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('6')).toBeDefined();
  });

  it('clicking an emote button emits localEmote and localInput', () => {
    render(<EmoteBar />);

    const emoteListener = vi.fn();
    const inputListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);
    gameEvents.on('localInput', inputListener);

    const musicBtn = screen.getByRole('button', { name: /emote music/i });
    fireEvent.click(musicBtn);

    expect(emoteListener).toHaveBeenCalledTimes(1);
    expect(emoteListener).toHaveBeenCalledWith({ emote: 'music' });
    expect(inputListener).toHaveBeenCalledTimes(1);
  });

  // Acceptance criterion:
  // Manual: the bottom bar works on touch.
  it('the bottom bar works on touch (onTouchEnd fires emote)', () => {
    render(<EmoteBar />);

    const emoteListener = vi.fn();
    const inputListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);
    gameEvents.on('localInput', inputListener);

    const waveBtn = screen.getByRole('button', { name: /emote wave/i });

    // Simulate touch interaction
    fireEvent.touchEnd(waveBtn);

    expect(emoteListener).toHaveBeenCalledTimes(1);
    expect(emoteListener).toHaveBeenCalledWith({ emote: 'wave' });
    expect(inputListener).toHaveBeenCalledTimes(1);
  });

  it('respects 1000 ms cooldown on repeated clicks', () => {
    vi.useFakeTimers();
    render(<EmoteBar />);

    const emoteListener = vi.fn();
    gameEvents.on('localEmote', emoteListener);

    const coffeeBtn = screen.getByRole('button', { name: /emote coffee/i });

    // First click
    fireEvent.click(coffeeBtn);
    expect(emoteListener).toHaveBeenCalledTimes(1);

    // Click 500 ms later: ignored
    vi.advanceTimersByTime(500);
    fireEvent.click(coffeeBtn);
    expect(emoteListener).toHaveBeenCalledTimes(1);

    // Click 600 ms later (1100 ms total): accepted
    vi.advanceTimersByTime(600);
    fireEvent.click(coffeeBtn);
    expect(emoteListener).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('delegates to gameEngine.player.triggerEmote when player is active', () => {
    const mockMap: any = {
      width: 10,
      height: 10,
      collision: new Array(100).fill(0),
    };
    const player = new LocalPlayer(mockMap, undefined, undefined, {
      skipPixi: true,
    });
    gameEngine.player = player;

    const triggerSpy = vi.spyOn(player, 'triggerEmote');

    render(<EmoteBar />);

    const sparkleBtn = screen.getByRole('button', { name: /emote sparkle/i });
    fireEvent.click(sparkleBtn);

    expect(triggerSpy).toHaveBeenCalledWith('sparkle', expect.any(Number));

    player.destroy();
  });
});
