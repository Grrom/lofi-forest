import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RosterPanel } from './RosterPanel';
import type { PlayerNetState } from '@lofi/shared';

describe('RosterPanel', () => {
  // Acceptance criterion:
  // Test: clicking a roster entry calls teleportNear with that player's coordinates.
  it("Test: clicking a roster entry calls teleportNear with that player's coordinates", () => {
    const teleportNear = vi.fn();

    const players: PlayerNetState[] = [
      {
        id: 'p1',
        name: 'Alice',
        x: 120,
        y: 240,
        zone: 'forest',
        facing: 'down',
        action: 'idle',
        outfit: { baseId: 'char_base', hatId: 'flower', colorHex: '#ffffff' },
        pomo: 'focus',
      },
      {
        id: 'p2',
        name: 'Bob',
        x: 350,
        y: 420,
        zone: 'lake',
        facing: 'right',
        action: 'vibe',
        outfit: { baseId: 'char_base', hatId: 'beanie', colorHex: '#3b82f6' },
        pomo: 'break',
      },
    ];

    render(<RosterPanel players={players} teleportNear={teleportNear} />);

    // Renders player entries
    const aliceBtn = screen.getByRole('button', { name: /teleport to alice/i });
    expect(aliceBtn).toBeDefined();

    const bobBtn = screen.getByRole('button', { name: /teleport to bob/i });
    expect(bobBtn).toBeDefined();

    // Click Alice -> calls teleportNear(120, 240)
    fireEvent.click(aliceBtn);
    expect(teleportNear).toHaveBeenCalledWith(120, 240);

    // Click Bob -> calls teleportNear(350, 420)
    fireEvent.click(bobBtn);
    expect(teleportNear).toHaveBeenCalledWith(350, 420);
  });

  it('supports Map of players and empty list fallback', () => {
    const playersMap = new Map<string, PlayerNetState>([
      [
        'peer-1',
        {
          id: 'peer-1',
          name: 'Charlie',
          x: 50,
          y: 75,
          zone: 'pub',
          facing: 'up',
          action: 'sit',
          outfit: { baseId: 'char_base', hatId: 'cap', colorHex: '#10b981' },
          pomo: 'none',
        },
      ],
    ]);

    const { rerender } = render(<RosterPanel players={playersMap} />);
    expect(screen.getByText('Charlie')).toBeDefined();

    // Rerender with empty map
    rerender(<RosterPanel players={new Map()} />);
    expect(screen.getByText('No players nearby')).toBeDefined();
  });
});
