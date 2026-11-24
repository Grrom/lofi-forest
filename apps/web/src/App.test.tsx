import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import { StorageManager } from './systems/StorageManager';
import { audioEngine } from './audio/AudioEngine';
import { createMockAudioContext } from './audio/mockAudioContext';
import { gameEngine } from './engine/game';
import { LocalPlayer } from './entities/LocalPlayer';

describe('apps/web HUD and Audio UI', () => {
  beforeEach(() => {
    StorageManager.reset();
    const mockCtx = createMockAudioContext(0);
    audioEngine.resetForTest(mockCtx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (gameEngine as any).player = undefined;
  });
  it('renders the HUD heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lofi-forest');
  });

  // Acceptance criterion:
  // Test: the master slider persists volumes.master.
  it('the master slider persists volumes.master', () => {
    render(<App />);

    const masterSlider = screen.getByLabelText(/master volume/i) as HTMLInputElement;
    expect(masterSlider).toBeDefined();

    // Change master slider value to 0.35
    fireEvent.change(masterSlider, { target: { value: '0.35' } });

    // Assert StorageManager persists volumes.master
    expect(StorageManager.get().volumes.master).toBe(0.35);
    expect(masterSlider.value).toBe('0.35');
  });

  // Acceptance criterion:
  // Test: the pill is visible before unlock and hidden after the first gesture.
  it('the pill is visible before unlock and hidden after the first gesture', async () => {
    render(<App />);

    // Pill should be visible before unlock
    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();
    expect(pill).not.toBeNull();

    // Trigger gesture (pointerdown on window)
    fireEvent.pointerDown(window);

    // Pill should now be hidden after gesture unlocks audio
    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });

  it('clicking the pill unlocks audio as well', async () => {
    render(<App />);

    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();

    fireEvent.click(pill);

    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });

  it('keydown gesture on window unlocks audio and hides pill', async () => {
    render(<App />);

    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();

    fireEvent.keyDown(window, { key: ' ' });

    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });

  it('renders the Auto-Stroll HUD toggle and allows toggling', () => {
    render(<App />);
    const strollBtn = screen.getByRole('button', { name: /toggle auto-stroll/i });
    expect(strollBtn).toBeDefined();
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    // Toggle on
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: ON');

    // Toggle off
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');
  });

  it('updates the HUD toggle to OFF when manual input turns auto-stroll off', () => {
    const width = 30;
    const height = 30;
    const mockMap: any = {
      width,
      height,
      tileWidth: 16,
      tileHeight: 16,
      ground: new Array(width * height).fill(1),
      decor: new Array(width * height).fill(0),
      entities: new Array(width * height).fill(0),
      canopy: new Array(width * height).fill(0),
      collision: new Array(width * height).fill(0),
      spawn: { id: 1, name: 'spawn', x: 32, y: 32, tileX: 2, tileY: 2 },
      seats: [
        { id: 10, name: 'seat_log', x: 100, y: 100, tileX: 6, tileY: 6, seatKind: 'log' },
      ],
      landmarks: [],
      zoneTriggers: [
        { id: 20, name: 'trigger_forest', zone: 'forest', x: 0, y: 0, width: 480, height: 480 },
      ],
      campfires: [],
      doors: [],
      cameraFoci: [],
    };
    const player = new LocalPlayer(mockMap, undefined, undefined, {
      initialX: 50,
      initialY: 50,
      skipPixi: true,
    });
    gameEngine.player = player;

    render(<App />);
    const strollBtn = screen.getByRole('button', { name: /toggle auto-stroll/i });
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    // 1. Click toggle to turn ON
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: ON');
    expect(player.isAutoStroll).toBe(true);

    // Call player.handleKeyDown('KeyD') inside act
    act(() => {
      player.handleKeyDown('KeyD');
    });
    expect(player.isAutoStroll).toBe(false);
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    // 2. Click toggle to turn ON again
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: ON');
    expect(player.isAutoStroll).toBe(true);

    // Call player.walkToTile(...) inside act
    act(() => {
      player.walkToTile(5, 5);
    });
    expect(player.isAutoStroll).toBe(false);
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    // 3. Click toggle to turn ON again
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: ON');
    expect(player.isAutoStroll).toBe(true);

    // Call player.tapSeat() inside act
    player.x = 105;
    player.y = 100;
    act(() => {
      player.tapSeat();
    });
    expect(player.isAutoStroll).toBe(false);
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    (gameEngine as any).player = undefined;
  });
});
