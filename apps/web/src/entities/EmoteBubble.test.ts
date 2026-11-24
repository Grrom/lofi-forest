import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Container } from 'pixi.js';
import {
  showEmote,
  getEmoteScale,
  clearAllEmoteBubbles,
  getActiveEmoteBubble,
} from './EmoteBubble';
import { PlayerAvatar } from './PlayerAvatar';
import { EMOTE_HOLD_MS } from '@lofi/shared';

describe('EmoteBubble and showEmote', () => {
  beforeEach(() => {
    clearAllEmoteBubbles();
  });

  afterEach(() => {
    clearAllEmoteBubbles();
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (injected clock): the bubble is visible at 100 ms and 3600 ms, and removed after 4000 ms.
  it('the bubble is visible at 100 ms and 3600 ms, and removed after 4000 ms', () => {
    let mockTime = 10000;
    const clock = () => mockTime;

    const avatar = new PlayerAvatar();
    avatar.position.set(100, 200);

    const worldUiLayer = new Container();
    worldUiLayer.label = 'worldUiLayer';

    const bubble = showEmote(avatar, 'music', worldUiLayer, clock);
    expect(bubble).toBeDefined();
    expect(bubble.emoteId).toBe('music');
    expect(worldUiLayer.children).toContain(bubble);

    // At 100 ms:
    mockTime = 10000 + 100;
    bubble.update(mockTime);
    expect(bubble.visible).toBe(true);
    expect(bubble.alpha).toBeGreaterThan(0);
    expect(worldUiLayer.children).toContain(bubble);

    // At 3600 ms:
    mockTime = 10000 + 3600;
    bubble.update(mockTime);
    expect(bubble.visible).toBe(true);
    expect(bubble.alpha).toBe(1);
    expect(worldUiLayer.children).toContain(bubble);

    // After 4000 ms (e.g. at 4001 ms):
    mockTime = 10000 + 4001;
    bubble.update(mockTime);
    expect(worldUiLayer.children).not.toContain(bubble);
    expect(bubble.destroyed).toBe(true);
    expect(bubble.isRemoved).toBe(true);

    avatar.destroy();
  });

  it('supports options object { worldUiLayer, clock }', () => {
    let mockTime = 5000;
    const clock = () => mockTime;

    const avatar = new PlayerAvatar();
    const worldUiLayer = new Container();

    const bubble = showEmote(avatar, 'heart', { worldUiLayer, clock });
    expect(worldUiLayer.children).toContain(bubble);

    // At 100 ms
    mockTime = 5000 + 100;
    bubble.update(mockTime);
    expect(bubble.visible).toBe(true);

    // At 3600 ms
    mockTime = 5000 + 3600;
    bubble.update(mockTime);
    expect(bubble.visible).toBe(true);

    // After 4000 ms
    mockTime = 5000 + 4000;
    bubble.update(mockTime);
    expect(worldUiLayer.children).not.toContain(bubble);

    avatar.destroy();
  });

  it('supports fake timers for wall-clock interval updates', () => {
    vi.useFakeTimers();

    const avatar = new PlayerAvatar();
    const worldUiLayer = new Container();

    const bubble = showEmote(avatar, 'sparkle', worldUiLayer);
    expect(worldUiLayer.children).toContain(bubble);

    // At 100 ms
    vi.advanceTimersByTime(100);
    expect(bubble.visible).toBe(true);
    expect(worldUiLayer.children).toContain(bubble);

    // At 3600 ms (advance 3500 ms more)
    vi.advanceTimersByTime(3500);
    expect(bubble.visible).toBe(true);
    expect(worldUiLayer.children).toContain(bubble);

    // After 4000 ms (advance 401 ms more, total 4001 ms)
    vi.advanceTimersByTime(401);
    expect(worldUiLayer.children).not.toContain(bubble);
    expect(bubble.destroyed).toBe(true);

    avatar.destroy();
    vi.useRealTimers();
  });

  it('pop-in overshoot tween scales 0 -> 1.2 -> 1 over 200 ms', () => {
    // getEmoteScale function test
    expect(getEmoteScale(0)).toBe(0);
    expect(getEmoteScale(-10)).toBe(0);

    // At 100 ms: scale is in mid-pop
    const scale100 = getEmoteScale(100);
    expect(scale100).toBeGreaterThan(0.9);
    expect(scale100).toBeLessThan(1.2);

    // At ~140 ms: overshoot peak ~1.2
    expect(getEmoteScale(140)).toBeCloseTo(1.2, 1);

    // At 200 ms: settles to 1.0
    expect(getEmoteScale(200)).toBeCloseTo(1.0, 1);

    // Above 200 ms: remains 1.0
    expect(getEmoteScale(300)).toBe(1.0);
    expect(getEmoteScale(3000)).toBe(1.0);
  });

  it('fades out over 300 ms after EMOTE_HOLD_MS', () => {
    let mockTime = 1000;
    const clock = () => mockTime;

    const avatar = new PlayerAvatar();
    const worldUiLayer = new Container();

    const bubble = showEmote(avatar, 'wave', worldUiLayer, clock);

    // During hold (200 + EMOTE_HOLD_MS = 3700 ms)
    mockTime = 1000 + 3600;
    bubble.update(mockTime);
    expect(bubble.alpha).toBe(1.0);

    // Midway through 300 ms fade-out (3700 + 150 = 3850 ms)
    mockTime = 1000 + 3850;
    bubble.update(mockTime);
    expect(bubble.alpha).toBeCloseTo(0.5, 1);

    // Fade-out complete (4000 ms)
    mockTime = 1000 + 4000;
    bubble.update(mockTime);
    expect(worldUiLayer.children).not.toContain(bubble);

    avatar.destroy();
  });

  it('a new emote replaces the current one', () => {
    let mockTime = 1000;
    const clock = () => mockTime;

    const avatar = new PlayerAvatar();
    const worldUiLayer = new Container();

    // First emote
    const bubble1 = showEmote(avatar, 'heart', worldUiLayer, clock);
    expect(worldUiLayer.children).toContain(bubble1);
    expect(getActiveEmoteBubble(avatar)).toBe(bubble1);
    expect(bubble1.emoteId).toBe('heart');

    // Show a new emote while bubble1 is still active
    mockTime += 1100;
    const bubble2 = showEmote(avatar, 'coffee', worldUiLayer, clock);

    // bubble1 must be removed and destroyed
    expect(worldUiLayer.children).not.toContain(bubble1);
    expect(bubble1.destroyed).toBe(true);

    // bubble2 is now active in worldUiLayer
    expect(worldUiLayer.children).toContain(bubble2);
    expect(getActiveEmoteBubble(avatar)).toBe(bubble2);
    expect(bubble2.emoteId).toBe('coffee');

    avatar.destroy();
  });

  it('bubble follows avatar position when avatar moves', () => {
    let mockTime = 1000;
    const clock = () => mockTime;

    const avatar = new PlayerAvatar();
    avatar.position.set(50, 80);

    const worldUiLayer = new Container();
    const bubble = showEmote(avatar, 'zzz', worldUiLayer, clock);

    expect(bubble.x).toBe(50);
    expect(bubble.y).toBe(80 - 28);

    // Avatar moves to (120, 160)
    avatar.position.set(120, 160);
    bubble.update(mockTime + 50);

    expect(bubble.x).toBe(120);
    expect(bubble.y).toBe(160 - 28);

    avatar.destroy();
  });
});
