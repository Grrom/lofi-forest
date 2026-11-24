import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PomodoroController,
  pomodoroController,
  formatTimerMs,
} from './PomodoroController';
import { StorageManager } from './StorageManager';
import { AfkDetector } from './AfkDetector';
import { gameEvents } from '../engine/events';
import type { PlayerAction } from '@lofi/shared';

describe('PomodoroController', () => {
  beforeEach(() => {
    StorageManager.reset();
    pomodoroController.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (injected clock): start() with 25/5 at t=0 gives remainingMs() = 1 500 000; at t=1 500 000 tick() moves to break with endsAtMs = 1 800 000 and reports one focus → break transition.
  it('start() with 25/5 at t=0 gives remainingMs() = 1 500 000; at t=1 500 000 tick() moves to break with endsAtMs = 1 800 000 and reports one focus → break transition', () => {
    let currentTime = 0;
    const now = () => currentTime;
    const controller = new PomodoroController({ now, autoDriver: false });
    controller.setPreset('25/5');

    controller.start();
    expect(controller.phase).toBe('focus');
    expect(controller.endsAtMs).toBe(1500000);
    expect(controller.remainingMs()).toBe(1500000);

    currentTime = 1500000;
    const tickResult = controller.tick();

    expect(controller.phase).toBe('break');
    expect(controller.endsAtMs).toBe(1800000);
    expect(tickResult.transitioned).toBe(true);
    expect(tickResult.from).toBe('focus');
    expect(tickResult.to).toBe('break');
    expect(tickResult.transitions).toHaveLength(1);
    expect(tickResult.transitions[0]).toEqual({ from: 'focus', to: 'break' });

    controller.destroy();
  });

  // Acceptance criterion:
  // Test: jumping from t=0 to t=3 700 000 (25/5) and calling tick() once lands in the right phase with the right endsAtMs, and reports at most one transition.
  it('jumping from t=0 to t=3 700 000 (25/5) and calling tick() once lands in the right phase with the right endsAtMs, and reports at most one transition', () => {
    let currentTime = 0;
    const now = () => currentTime;
    const controller = new PomodoroController({ now, autoDriver: false });
    controller.setPreset('25/5');

    controller.start();
    expect(controller.endsAtMs).toBe(1500000);

    // Jump 3 700 000 ms into the future
    // Cycle 1: 0..1500000 focus, 1500000..1800000 break
    // Cycle 2: 1800000..3300000 focus, 3300000..3600000 break
    // Cycle 3: 3600000..5100000 focus
    // At t=3 700 000, we are in Cycle 3 focus, ending at 5 100 000
    currentTime = 3700000;
    const tickResult = controller.tick();

    expect(controller.phase).toBe('focus');
    expect(controller.endsAtMs).toBe(5100000);
    expect(tickResult.transitioned).toBe(true);
    expect(tickResult.to).toBe('focus');
    expect(tickResult.transitions.length).toBeLessThanOrEqual(1);

    controller.destroy();
  });

  // Acceptance criterion:
  // Test: pause() with 600 000 ms left stores pausedRemainingMs=600000, endsAtMs=null; resume() at t sets endsAtMs = t + 600000.
  it('pause() with 600 000 ms left stores pausedRemainingMs=600000, endsAtMs=null; resume() at t sets endsAtMs = t + 600000', () => {
    let currentTime = 0;
    const now = () => currentTime;
    const controller = new PomodoroController({ now, autoDriver: false });
    controller.setPreset('25/5');

    controller.start();
    expect(controller.endsAtMs).toBe(1500000);

    // Advance to t = 900 000, remaining = 1 500 000 - 900 000 = 600 000 ms
    currentTime = 900000;
    controller.pause();

    expect(controller.pausedRemainingMs).toBe(600000);
    expect(controller.endsAtMs).toBeNull();
    expect(controller.remainingMs()).toBe(600000);

    // Resume at t = 1 200 000: endsAtMs should be 1 200 000 + 600 000 = 1 800 000
    currentTime = 1200000;
    controller.resume();

    expect(controller.endsAtMs).toBe(1800000);
    expect(controller.pausedRemainingMs).toBeNull();
    expect(controller.remainingMs()).toBe(600000);

    controller.destroy();
  });

  // Acceptance criterion:
  // Test: start() calls scheduleChime with the focus endsAtMs; pause() cancels it.
  it('start() calls scheduleChime with the focus endsAtMs; pause() cancels it', () => {
    let currentTime = 5000;
    const now = () => currentTime;
    const mockAudio = {
      scheduleChime: vi.fn((endsAt) => ({ id: 42, when: endsAt })),
      cancelChime: vi.fn(),
    };

    const controller = new PomodoroController({
      now,
      audio: mockAudio,
      autoDriver: false,
    });

    controller.start();
    expect(mockAudio.scheduleChime).toHaveBeenCalledTimes(1);
    expect(mockAudio.scheduleChime).toHaveBeenCalledWith(controller.endsAtMs);
    expect(mockAudio.cancelChime).not.toHaveBeenCalled();

    controller.pause();
    expect(mockAudio.cancelChime).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  // Acceptance criterion:
  // Test: during focus the AfkDetector never triggers sleep.
  it('during focus the AfkDetector never triggers sleep', () => {
    vi.useFakeTimers();
    const player: { action: PlayerAction } = { action: 'idle' };
    const controller = new PomodoroController({ autoDriver: false });

    const detector = new AfkDetector({
      player,
      isSuppressed: () => controller.phase === 'focus',
    });

    expect(detector.action).toBe('idle');

    controller.start();
    expect(controller.phase).toBe('focus');
    expect(detector.isSuppressed()).toBe(true);

    // Advance time by 300 000 ms (normal AFK threshold)
    vi.advanceTimersByTime(300000);
    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');
    expect(detector.isSleeping).toBe(false);

    // Advance 600 000 ms more (15 min total): still no sleep
    vi.advanceTimersByTime(600000);
    expect(detector.action).toBe('idle');
    expect(player.action).toBe('idle');
    expect(detector.isSleeping).toBe(false);

    detector.destroy();
    controller.destroy();
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test: localBadge() is focus during focus, break during break, none when idle.
  it('localBadge() is focus during focus, break during break, none when idle', () => {
    const controller = new PomodoroController({ autoDriver: false });

    // Idle
    expect(controller.phase).toBe('idle');
    expect(controller.localBadge()).toBe('none');

    // Focus
    controller.start();
    expect(controller.phase).toBe('focus');
    expect(controller.localBadge()).toBe('focus');

    // Break
    controller.skip();
    expect(controller.phase).toBe('break');
    expect(controller.localBadge()).toBe('break');

    // Reset to idle
    controller.reset();
    expect(controller.phase).toBe('idle');
    expect(controller.localBadge()).toBe('none');

    controller.destroy();
  });

  it('skip() loops focus -> break -> focus and reschedules chime', () => {
    const mockAudio = {
      scheduleChime: vi.fn(),
      cancelChime: vi.fn(),
    };
    const controller = new PomodoroController({
      audio: mockAudio,
      autoDriver: false,
    });

    controller.start();
    expect(controller.phase).toBe('focus');
    expect(mockAudio.scheduleChime).toHaveBeenCalledTimes(1);

    // Skip moves to break
    const res1 = controller.skip();
    expect(controller.phase).toBe('break');
    expect(res1.to).toBe('break');
    expect(mockAudio.cancelChime).toHaveBeenCalled();

    // Skip moves to focus
    const res2 = controller.skip();
    expect(controller.phase).toBe('focus');
    expect(res2.to).toBe('focus');
    expect(mockAudio.scheduleChime).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('formatTimerMs formats remaining time as MM:SS', () => {
    expect(formatTimerMs(1500000)).toBe('25:00');
    expect(formatTimerMs(1499000)).toBe('24:59');
    expect(formatTimerMs(60000)).toBe('01:00');
    expect(formatTimerMs(1000)).toBe('00:01');
    expect(formatTimerMs(0)).toBe('00:00');
  });

  it('persists custom presets up to 180 min focus and 60 min break', () => {
    const controller = new PomodoroController({ autoDriver: false });

    controller.setPreset('custom', 150, 45);
    expect(controller.focusMin).toBe(150);
    expect(controller.breakMin).toBe(45);
    expect(StorageManager.get().pomo.focusMin).toBe(150);
    expect(StorageManager.get().pomo.breakMin).toBe(45);

    // Clamp over 180 and over 60
    controller.setPreset('custom', 250, 100);
    expect(controller.focusMin).toBe(180);
    expect(controller.breakMin).toBe(60);

    controller.destroy();
  });

  it('driver runs tick on 250ms interval and on visibilitychange', () => {
    vi.useFakeTimers();
    let tickCount = 0;
    const controller = new PomodoroController({
      now: () => Date.now(),
      autoDriver: true,
    });

    const origTick = controller.tick.bind(controller);
    vi.spyOn(controller, 'tick').mockImplementation(() => {
      tickCount++;
      return origTick();
    });

    // Advance 250 ms: tick should run
    vi.advanceTimersByTime(250);
    expect(tickCount).toBe(1);

    vi.advanceTimersByTime(500);
    expect(tickCount).toBe(3);

    // Trigger visibilitychange event
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tickCount).toBe(4);

    controller.destroy();
    vi.useRealTimers();
  });
});
