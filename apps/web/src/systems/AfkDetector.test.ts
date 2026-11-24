import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AfkDetector } from './AfkDetector';
import { gameEvents } from '../engine/events';
import type { PlayerAction } from '@lofi/shared';

describe('AfkDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    gameEvents.removeAllListeners();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test (fake timers): sleep at 300 000 ms without input, not at 299 000 ms.
  it('sleep at 300 000 ms without input, not at 299 000 ms', () => {
    const player: { action: PlayerAction } = { action: 'idle' };
    const detector = new AfkDetector({ player });

    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');

    // Advance to 299 000 ms: should NOT sleep
    vi.advanceTimersByTime(299000);
    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');
    expect(detector.isSleeping).toBe(false);

    // Advance 1000 ms more to reach exactly 300 000 ms: should sleep
    vi.advanceTimersByTime(1000);
    expect(detector.action).toBe('sleep');
    expect(player.action).toBe('sleep');
    expect(detector.isSleeping).toBe(true);

    detector.destroy();
  });

  // Acceptance criterion:
  // Test: with isSuppressed returning true, no sleep after 10 minutes.
  it('with isSuppressed returning true, no sleep after 10 minutes', () => {
    const player: { action: PlayerAction } = { action: 'idle' };
    const detector = new AfkDetector({
      player,
      isSuppressed: () => true,
    });

    // 10 minutes = 600 000 ms
    vi.advanceTimersByTime(600000);
    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');
    expect(detector.isSleeping).toBe(false);

    detector.destroy();
  });

  // Acceptance criterion:
  // Test: input after sleep resets the action to idle.
  it('input after sleep resets the action to idle', () => {
    const player: { action: PlayerAction } = { action: 'idle' };
    const detector = new AfkDetector({ player });

    // Put detector to sleep at 300 000 ms
    vi.advanceTimersByTime(300000);
    expect(detector.action).toBe('sleep');
    expect(player.action).toBe('sleep');

    // Emit localInput event
    gameEvents.emit('localInput', {});

    // Action must reset to 'idle'
    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');
    expect(detector.isSleeping).toBe(false);

    detector.destroy();
  });

  it('input before 300 000 ms resets the afk timer', () => {
    const player: { action: PlayerAction } = { action: 'idle' };
    const detector = new AfkDetector({ player });

    // Advance 200 000 ms
    vi.advanceTimersByTime(200000);
    expect(detector.action).toBe('idle');

    // Player provides input at 200 000 ms
    gameEvents.emit('localInput', {});

    // Advance 200 000 ms more (total 400 000 ms, but only 200 000 ms since last input)
    vi.advanceTimersByTime(200000);
    expect(detector.action).toBe('idle');

    // Advance 100 000 ms more (now 300 000 ms since last input)
    vi.advanceTimersByTime(100000);
    expect(detector.action).toBe('sleep');

    detector.destroy();
  });
});
