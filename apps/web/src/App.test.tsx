import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { gameEngine } from './engine/game';
import { LocalPlayer } from './entities/LocalPlayer';
import { defaultFastTravelSystem } from './systems/FastTravelSystem';

describe('apps/web HUD', () => {
  it('renders the HUD heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lofi-forest');
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

  // Acceptance Criterion:
  // React Fast Travel panel: unlocked landmarks are clickable; locked ones show as greyed ???.
  it('renders the Fast Travel panel: unlocked landmarks are clickable; locked ones show as greyed ???', () => {
    render(<App />);

    // Fast travel section exists
    expect(screen.getByText('Fast Travel')).toBeDefined();

    // With fresh storage, only Forest Clearing is unlocked
    const clearingBtn = screen.getByRole('button', { name: /forest clearing/i });
    expect(clearingBtn).toBeDefined();

    // Locked landmarks show as greyed ???
    const lockedItems = screen.getAllByText('???');
    expect(lockedItems.length).toBeGreaterThanOrEqual(2); // Lakeside Dock and Cozy Pub are locked
  });

  it('clicking an unlocked landmark invokes teleportToLandmark', () => {
    const teleportSpy = vi.fn();
    gameEngine.player = {
      teleportToLandmark: teleportSpy,
      isAutoStroll: false,
    } as any;

    render(<App />);

    const clearingBtn = screen.getByRole('button', { name: /forest clearing/i });
    fireEvent.click(clearingBtn);

    expect(teleportSpy).toHaveBeenCalledWith('forest_clearing');

    (gameEngine as any).player = undefined;
  });

  it('displays the discovery toast for 3 seconds', () => {
    render(<App />);

    // Before discovery: no toast
    expect(screen.queryByRole('status')).toBeNull();

    // Trigger discovery toast
    act(() => {
      defaultFastTravelSystem.showToast('Discovered: Lakeside Dock', 3000);
    });

    // Toast appears
    const toast = screen.getByRole('status');
    expect(toast).toBeDefined();
    expect(toast.textContent).toBe('Discovered: Lakeside Dock');

    // Clean up
    act(() => {
      defaultFastTravelSystem.clearToast();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
