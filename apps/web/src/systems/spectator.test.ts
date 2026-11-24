import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseSpectatorParams,
  epochCycle,
  SpectatorCycleController,
} from './spectator';
import { gameEngine } from '../engine/game';

describe('Spectator mode & Epoch cycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Tests: parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1') → spectator, lake, hideNames true, overlay false, 50/10; an invalid zone → forest; pomo=0-5 → 50/10.
  it("parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1') → spectator, lake, hideNames true, overlay false, 50/10; an invalid zone → forest; pomo=0-5 → 50/10", () => {
    const params = parseSpectatorParams('?room=public&mode=spectator&zone=lake&hideNames=1');
    expect(params).toEqual({
      spectator: true,
      zone: 'lake',
      hideNames: true,
      overlay: false,
      focusMin: 50,
      breakMin: 10,
    });

    const invalidZone = parseSpectatorParams('?zone=dungeon');
    expect(invalidZone.zone).toBe('forest');

    const invalidPomo = parseSpectatorParams('?pomo=0-5');
    expect(invalidPomo.focusMin).toBe(50);
    expect(invalidPomo.breakMin).toBe(10);
  });

  // Acceptance criterion:
  // Tests (50/10): epochCycle(k*3600000) → focus, endsAtMs = k*3600000 + 3000000; epochCycle(k*3600000 + 3000000) → break, endsAtMs = (k+1)*3600000.
  it('epochCycle(k*3600000) → focus, endsAtMs = k*3600000 + 3000000; epochCycle(k*3600000 + 3000000) → break, endsAtMs = (k+1)*3600000', () => {
    const testMultipliers = [0, 1, 2, 10, 100, 123456];

    for (const k of testMultipliers) {
      const focusRes = epochCycle(k * 3600000);
      expect(focusRes.phase).toBe('focus');
      expect(focusRes.endsAtMs).toBe(k * 3600000 + 3000000);

      const breakRes = epochCycle(k * 3600000 + 3000000);
      expect(breakRes.phase).toBe('break');
      expect(breakRes.endsAtMs).toBe((k + 1) * 3600000);
    }
  });

  // Acceptance criterion:
  // Test: F3 moves the camera target to the pub camera_focus; H toggles the overlay.
  it('F3 moves the camera target to the pub camera_focus; H toggles the overlay', () => {
    gameEngine.isSpectator = true;

    // 1. Initial spectator zone set to forest
    gameEngine.setSpectatorZone('forest');
    const forestFocus = gameEngine.parsedMap.cameraFoci.find((f) => f.zone === 'forest');
    expect(gameEngine.camera.target).toBe(forestFocus);

    // 2. F3 moves camera target to pub camera_focus
    const pubFocus = gameEngine.parsedMap.cameraFoci.find((f) => f.zone === 'pub');
    expect(pubFocus).toBeDefined();

    gameEngine.handleKeyDown({ key: 'F3', preventDefault: vi.fn() });
    expect(gameEngine.camera.target).toBe(pubFocus);
    expect(gameEngine.camera.target?.x).toBe(pubFocus!.x);
    expect(gameEngine.camera.target?.y).toBe(pubFocus!.y);

    // Also verify F1 and F2 move to forest and lake foci
    const lakeFocus = gameEngine.parsedMap.cameraFoci.find((f) => f.zone === 'lake');
    gameEngine.handleKeyDown({ key: 'F2', preventDefault: vi.fn() });
    expect(gameEngine.camera.target).toBe(lakeFocus);

    gameEngine.handleKeyDown({ key: 'F3', preventDefault: vi.fn() });
    expect(gameEngine.camera.target).toBe(pubFocus);

    // 3. H toggles the overlay
    const initialOverlay = gameEngine.isOverlayVisible;
    gameEngine.handleKeyDown({ key: 'h', preventDefault: vi.fn() });
    expect(gameEngine.isOverlayVisible).toBe(!initialOverlay);

    gameEngine.handleKeyDown({ key: 'H', preventDefault: vi.fn() });
    expect(gameEngine.isOverlayVisible).toBe(initialOverlay);
  });

  it('with isSpectator = false, handleKeyDown does not toggle overlay, call preventDefault, or change camera target/zone', () => {
    gameEngine.isSpectator = false;
    const initialOverlay = gameEngine.isOverlayVisible;
    const preventDefault = vi.fn();

    // Key 'h' does not toggle overlay and does not call preventDefault
    gameEngine.handleKeyDown({ key: 'h', preventDefault });
    expect(gameEngine.isOverlayVisible).toBe(initialOverlay);
    expect(preventDefault).not.toHaveBeenCalled();

    gameEngine.handleKeyDown({ key: 'H', preventDefault });
    expect(gameEngine.isOverlayVisible).toBe(initialOverlay);
    expect(preventDefault).not.toHaveBeenCalled();

    // F3 leaves camera.target and currentZone unchanged
    const initialTarget = gameEngine.camera.target;
    const initialZone = (gameEngine as any).currentZone;
    gameEngine.handleKeyDown({ key: 'F3', preventDefault });
    expect(gameEngine.camera.target).toBe(initialTarget);
    expect((gameEngine as any).currentZone).toBe(initialZone);
    expect(preventDefault).not.toHaveBeenCalled();

    // Input focus guard: even if isSpectator = true, typing inside an input element is ignored
    gameEngine.isSpectator = true;
    gameEngine.handleKeyDown({ key: 'h', target: { tagName: 'INPUT' }, preventDefault });
    expect(gameEngine.isOverlayVisible).toBe(initialOverlay);
    expect(preventDefault).not.toHaveBeenCalled();

    gameEngine.handleKeyDown({ key: 'h', target: { isContentEditable: true }, preventDefault });
    expect(gameEngine.isOverlayVisible).toBe(initialOverlay);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  // Acceptance criterion:
  // Test: entering a focus phase calls scheduleChime with that phase's endsAtMs.
  it("entering a focus phase calls scheduleChime with that phase's endsAtMs", () => {
    const scheduleChimeSpy = vi.fn();
    const setVignetteSpy = vi.fn();
    const pulseGlowSpy = vi.fn();

    const k = 10;
    const cycleStart = k * 3600000;
    const focusEndsAt = cycleStart + 3000000;
    const cycleEnd = (k + 1) * 3600000;

    // 1. Starting during a focus phase triggers scheduleChime with focusEndsAt
    const controller = new SpectatorCycleController({
      focusMin: 50,
      breakMin: 10,
      now: () => cycleStart + 1000,
      autoStart: false,
      effects: {
        scheduleChime: scheduleChimeSpy,
        setVignette: setVignetteSpy,
        pulseGlow: pulseGlowSpy,
      },
    });

    controller.start(cycleStart + 1000);
    expect(scheduleChimeSpy).toHaveBeenCalledTimes(1);
    expect(scheduleChimeSpy).toHaveBeenCalledWith(focusEndsAt);
    expect(setVignetteSpy).toHaveBeenCalledWith(true);

    // 2. Transition from focus to break: pulseGlow() and vignette off
    controller.tick(focusEndsAt);
    expect(controller.phase).toBe('break');
    expect(pulseGlowSpy).toHaveBeenCalledTimes(1);
    expect(setVignetteSpy).toHaveBeenCalledWith(false);

    // 3. Transition from break to focus: calls scheduleChime with next phase's endsAtMs
    const nextFocusEndsAt = cycleEnd + 3000000;
    controller.tick(cycleEnd);
    expect(controller.phase).toBe('focus');
    expect(scheduleChimeSpy).toHaveBeenCalledTimes(2);
    expect(scheduleChimeSpy).toHaveBeenLastCalledWith(nextFocusEndsAt);
    expect(setVignetteSpy).toHaveBeenCalledWith(true);

    controller.destroy();
  });
});
