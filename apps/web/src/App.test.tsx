import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { gameEngine } from './engine/game';
import { LocalPlayer } from './entities/LocalPlayer';

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

  it('renders the Vibe HUD toggle and allows toggling vibe', () => {
    const mockMap: any = {
      width: 10,
      height: 10,
      collision: new Array(100).fill(0),
    };
    const player = new LocalPlayer(mockMap, undefined, undefined, {
      skipPixi: true,
    });
    gameEngine.player = player;

    render(<App />);
    const vibeBtn = screen.getByRole('button', { name: /toggle vibe/i });
    expect(vibeBtn).toBeDefined();
    expect(vibeBtn.textContent).toContain('Vibe: OFF');
    expect(player.action).toBe('idle');

    // Toggle ON
    fireEvent.click(vibeBtn);
    expect(vibeBtn.textContent).toContain('Vibe: ON');
    expect(player.action).toBe('vibe');

    // Toggle OFF
    fireEvent.click(vibeBtn);
    expect(vibeBtn.textContent).toContain('Vibe: OFF');
    expect(player.action).toBe('idle');

    (gameEngine as any).player = undefined;
  });

  it('renders the Wardrobe HUD button and toggles the Wardrobe dialog', () => {
    render(<App />);

    // Wardrobe dialog not initially shown
    expect(screen.queryByRole('dialog', { name: /wardrobe/i })).toBeNull();

    // Click Wardrobe button
    const wardrobeBtn = screen.getByRole('button', { name: /toggle wardrobe/i });
    fireEvent.click(wardrobeBtn);

    // Wardrobe dialog opens
    expect(screen.getByRole('dialog', { name: /wardrobe/i })).toBeDefined();

    // Close via close button in dialog
    const closeBtn = screen.getByRole('button', { name: /close wardrobe/i });
    fireEvent.click(closeBtn);

    // Dialog closes
    expect(screen.queryByRole('dialog', { name: /wardrobe/i })).toBeNull();
  });
});
