import { describe, it, expect } from 'vitest';
import { parseSpectatorParams, epochCycle } from './spectator.js';

describe('Spectator utils (parseSpectatorParams & epochCycle)', () => {
  // Acceptance criterion:
  // Tests: parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1') → spectator, lake, hideNames true, overlay false, 50/10; an invalid zone → forest; pomo=0-5 → 50/10.
  it("parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1') → spectator, lake, hideNames true, overlay false, 50/10; an invalid zone → forest; pomo=0-5 → 50/10", () => {
    // Primary query
    const res = parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1');
    expect(res).toEqual({
      spectator: true,
      zone: 'lake',
      hideNames: true,
      overlay: false,
      focusMin: 50,
      breakMin: 10,
    });

    // An invalid zone -> forest
    const invalidZoneRes = parseSpectatorParams('?zone=volcano');
    expect(invalidZoneRes.zone).toBe('forest');

    const emptyZoneRes = parseSpectatorParams('?zone=');
    expect(emptyZoneRes.zone).toBe('forest');

    // pomo=0-5 -> 50/10 (0 is below valid 1-180 range)
    const invalidPomoRes = parseSpectatorParams('?pomo=0-5');
    expect(invalidPomoRes.focusMin).toBe(50);
    expect(invalidPomoRes.breakMin).toBe(10);
  });

  it('parseSpectatorParams handles pomo overrides, overlay=1, and defaults', () => {
    // Valid pomo override
    const pomoRes = parseSpectatorParams('?pomo=25-5&overlay=1');
    expect(pomoRes.focusMin).toBe(25);
    expect(pomoRes.breakMin).toBe(5);
    expect(pomoRes.overlay).toBe(true);

    // Boundary pomo: 1-1 and 180-60
    const minPomo = parseSpectatorParams('?pomo=1-1');
    expect(minPomo.focusMin).toBe(1);
    expect(minPomo.breakMin).toBe(1);

    const maxPomo = parseSpectatorParams('?pomo=180-60');
    expect(maxPomo.focusMin).toBe(180);
    expect(maxPomo.breakMin).toBe(60);

    // Out-of-bounds pomo
    const outHighPomo = parseSpectatorParams('?pomo=181-10');
    expect(outHighPomo.focusMin).toBe(50);
    expect(outHighPomo.breakMin).toBe(10);

    const outBreakHigh = parseSpectatorParams('?pomo=50-61');
    expect(outBreakHigh.focusMin).toBe(50);
    expect(outBreakHigh.breakMin).toBe(10);

    const malformedPomo = parseSpectatorParams('?pomo=abc');
    expect(malformedPomo.focusMin).toBe(50);
    expect(malformedPomo.breakMin).toBe(10);

    // Empty or no params
    const defaultRes = parseSpectatorParams('');
    expect(defaultRes).toEqual({
      spectator: false,
      zone: 'forest',
      hideNames: false,
      overlay: false,
      focusMin: 50,
      breakMin: 10,
    });

    // URLSearchParams object directly
    const urlParams = new URLSearchParams('mode=spectator&zone=pub&overlay=1');
    const directRes = parseSpectatorParams(urlParams);
    expect(directRes.spectator).toBe(true);
    expect(directRes.zone).toBe('pub');
    expect(directRes.overlay).toBe(true);
  });

  // Acceptance criterion:
  // Tests (50/10): epochCycle(k*3600000) → focus, endsAtMs = k*3600000 + 3000000; epochCycle(k*3600000 + 3000000) → break, endsAtMs = (k+1)*3600000.
  it('epochCycle(k*3600000) → focus, endsAtMs = k*3600000 + 3000000; epochCycle(k*3600000 + 3000000) → break, endsAtMs = (k+1)*3600000', () => {
    const testCases = [0, 1, 5, 42, 1000, 1700000];

    for (const k of testCases) {
      // At start of cycle: k * 3600000 -> focus, endsAtMs = k * 3600000 + 3000000
      const startMs = k * 3600000;
      const focusRes = epochCycle(startMs, 50, 10);
      expect(focusRes.phase).toBe('focus');
      expect(focusRes.endsAtMs).toBe(k * 3600000 + 3000000);

      // Mid focus: k * 3600000 + 1500000 -> focus
      const midFocus = epochCycle(startMs + 1500000, 50, 10);
      expect(midFocus.phase).toBe('focus');
      expect(midFocus.endsAtMs).toBe(k * 3600000 + 3000000);

      // Exactly at focus transition to break: k * 3600000 + 3000000 -> break, endsAtMs = (k + 1) * 3600000
      const breakMs = k * 3600000 + 3000000;
      const breakRes = epochCycle(breakMs, 50, 10);
      expect(breakRes.phase).toBe('break');
      expect(breakRes.endsAtMs).toBe((k + 1) * 3600000);

      // Mid break: k * 3600000 + 3300000 -> break
      const midBreak = epochCycle(startMs + 3300000, 50, 10);
      expect(midBreak.phase).toBe('break');
      expect(midBreak.endsAtMs).toBe((k + 1) * 3600000);
    }
  });

  it('epochCycle handles custom focus and break durations', () => {
    // 25/5 cycle = 30 minutes = 1800000 ms. Focus = 25 min = 1500000 ms.
    const resFocus = epochCycle(0, 25, 5);
    expect(resFocus.phase).toBe('focus');
    expect(resFocus.endsAtMs).toBe(1500000);

    const resBreak = epochCycle(1500000, 25, 5);
    expect(resBreak.phase).toBe('break');
    expect(resBreak.endsAtMs).toBe(1800000);
  });
});
