import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetSync } from './NetSync';
import type { TransportAdapter, TransportStatus } from './TransportAdapter';
import type { PlayerNetState, PomoBadge } from '@lofi/shared';
import { gameEvents } from '../engine/events';
import { pomodoroController } from '../systems/PomodoroController';
import { RemotePlayer } from '../entities/RemotePlayer';
import { StorageManager } from '../systems/StorageManager';

function createMockTransport(): TransportAdapter & {
  playersCb: ((p: Map<string, PlayerNetState>) => void) | null;
  emoteCb: ((id: string, e: any) => void) | null;
  statusCb: ((s: TransportStatus) => void) | null;
} {
  let playersCb: ((p: Map<string, PlayerNetState>) => void) | null = null;
  let emoteCb: ((id: string, e: any) => void) | null = null;
  let statusCb: ((s: TransportStatus) => void) | null = null;

  return {
    mode: 'solo',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendLocalState: vi.fn(),
    sendEmote: vi.fn(),
    onPlayersChange: vi.fn((cb) => {
      playersCb = cb;
      return () => {
        playersCb = null;
      };
    }),
    onEmote: vi.fn((cb) => {
      emoteCb = cb;
      return () => {
        emoteCb = null;
      };
    }),
    onStatusChange: vi.fn((cb) => {
      statusCb = cb;
      return () => {
        statusCb = null;
      };
    }),
    get playersCb() {
      return playersCb;
    },
    get emoteCb() {
      return emoteCb;
    },
    get statusCb() {
      return statusCb;
    },
  };
}

describe('NetSync', () => {
  let mockTransport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    mockTransport = createMockTransport();
    pomodoroController.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Acceptance criterion:
  // Test (fake timers): an unchanged state is sent once and again only after 2000 ms; a changed state is sent within 100 ms; at most 10 sends per second.
  it('Test (fake timers): an unchanged state is sent once and again only after 2000 ms; a changed state is sent within 100 ms; at most 10 sends per second', () => {
    vi.useFakeTimers();

    let currentTime = 1000;
    const clock = () => currentTime;

    const mockState = {
      x: 10,
      y: 20,
      zone: 'forest' as const,
      facing: 'down' as const,
      action: 'idle' as const,
    };

    const netSync = new NetSync(mockTransport, {
      getLocalState: () => ({ ...mockState }),
      getName: () => 'Explorer',
      getOutfit: () => ({ baseId: 'char_base', hatId: 'none', colorHex: '#4a7c59' }),
      getPomo: () => 'none',
      clock,
      autoStart: true,
    });

    // Initial state is sent once immediately on start
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(1);

    // Advance 1900 ms -> unchanged state is NOT resent before 2000 ms
    currentTime += 1900;
    vi.advanceTimersByTime(1900);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(1);

    // Advance another 100 ms (total 2000 ms since first send) -> sent again (heartbeat)
    currentTime += 100;
    vi.advanceTimersByTime(100);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(2);

    // Advance 500 ms: unchanged state is not sent
    currentTime += 500;
    vi.advanceTimersByTime(500);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(2);

    // State changes: a changed state is sent within 100 ms
    mockState.x = 55;
    currentTime += 30;
    vi.advanceTimersByTime(30);
    // Before the 100ms interval tick finishes
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(2);

    // Reaching 100 ms since previous tick triggers send of changed state
    currentTime += 70;
    vi.advanceTimersByTime(70);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(3);

    // At most 10 sends per second:
    // Even if state changes on every single millisecond for 1000 ms,
    // interval fires at 10 Hz (every 100 ms), meaning at most 10 sends occur during that 1 second.
    const sendsBefore = (mockTransport.sendLocalState as any).mock.calls.length;
    for (let i = 0; i < 1000; i++) {
      mockState.x += 1;
      currentTime += 1;
      vi.advanceTimersByTime(1);
    }
    const sendsAfter = (mockTransport.sendLocalState as any).mock.calls.length;
    const sendsInOneSecond = sendsAfter - sendsBefore;
    expect(sendsInOneSecond).toBeLessThanOrEqual(10);

    netSync.destroy();
  });

  // Acceptance criterion:
  // Test: NetSync keeps sending with the Pixi ticker stopped.
  it('Test: NetSync keeps sending with the Pixi ticker stopped', () => {
    vi.useFakeTimers();

    let currentTime = 5000;
    const clock = () => currentTime;

    const mockState = {
      x: 10,
      y: 20,
      zone: 'forest' as const,
      facing: 'down' as const,
      action: 'idle' as const,
    };

    // NetSync runs on setInterval, independent of the Pixi ticker
    const netSync = new NetSync(mockTransport, {
      getLocalState: () => ({ ...mockState }),
      getName: () => 'Explorer',
      getOutfit: () => ({ baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' }),
      getPomo: () => 'none',
      clock,
      autoStart: true,
    });

    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(1);

    // Without any Pixi ticker ticks, time passes via setInterval
    currentTime += 2000;
    vi.advanceTimersByTime(2000);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(2);

    // Modify state and advance by interval period
    mockState.y = 80;
    currentTime += 100;
    vi.advanceTimersByTime(100);
    expect(mockTransport.sendLocalState).toHaveBeenCalledTimes(3);

    netSync.destroy();
  });

  // Acceptance criterion:
  // Test: the sent state's pomo equals localBadge().
  it("Test: the sent state's pomo equals localBadge()", () => {
    const netSync = new NetSync(mockTransport, {
      getLocalState: () => ({
        x: 0,
        y: 0,
        zone: 'forest',
        facing: 'down',
        action: 'idle',
      }),
      getName: () => 'TestPlayer',
      getOutfit: () => ({ baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' }),
      autoStart: false,
    });

    // Idle phase -> localBadge() is 'none'
    expect(pomodoroController.localBadge()).toBe('none');
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pomo: 'none' })
    );

    // Focus phase -> localBadge() is 'focus'
    pomodoroController.start();
    expect(pomodoroController.localBadge()).toBe('focus');
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pomo: 'focus' })
    );

    // Break phase -> localBadge() is 'break'
    pomodoroController.skip();
    expect(pomodoroController.localBadge()).toBe('break');
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pomo: 'break' })
    );

    netSync.destroy();
  });

  // Acceptance criterion:
  // Test: a players map missing a previously seen id removes that RemotePlayer.
  it('Test: a players map missing a previously seen id removes that RemotePlayer', () => {
    const netSync = new NetSync(mockTransport, { autoStart: false });

    const p1: PlayerNetState = {
      id: 'p1',
      name: 'Player One',
      x: 10,
      y: 20,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
      outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
      pomo: 'none',
    };

    const p2: PlayerNetState = {
      id: 'p2',
      name: 'Player Two',
      x: 30,
      y: 40,
      zone: 'pub',
      facing: 'left',
      action: 'walk',
      outfit: { baseId: 'char_base', hatId: 'beanie', colorHex: '#4a7c59' },
      pomo: 'focus',
    };

    // First update: p1 and p2 present
    const map1 = new Map<string, PlayerNetState>([
      ['p1', p1],
      ['p2', p2],
    ]);
    mockTransport.playersCb!(map1);

    expect(netSync.remotePlayers.has('p1')).toBe(true);
    expect(netSync.remotePlayers.has('p2')).toBe(true);

    const remotePlayer2 = netSync.remotePlayers.get('p2')!;
    const destroySpy = vi.spyOn(remotePlayer2, 'destroy');

    // Second update: p2 is missing
    const map2 = new Map<string, PlayerNetState>([['p1', p1]]);
    mockTransport.playersCb!(map2);

    expect(netSync.remotePlayers.has('p1')).toBe(true);
    expect(netSync.remotePlayers.has('p2')).toBe(false);
    expect(destroySpy).toHaveBeenCalled();

    netSync.destroy();
  });

  it('forwards GameEvents.localEmote to transport.sendEmote', () => {
    const netSync = new NetSync(mockTransport, { autoStart: false });

    gameEvents.emit('localEmote', { emote: 'heart' });
    expect(mockTransport.sendEmote).toHaveBeenCalledWith('heart');

    gameEvents.emit('localEmote', { emote: 'coffee' });
    expect(mockTransport.sendEmote).toHaveBeenCalledWith('coffee');

    netSync.destroy();
  });

  it('incoming emotes call showEmote on the remote avatar', () => {
    const netSync = new NetSync(mockTransport, { autoStart: false });

    const p1: PlayerNetState = {
      id: 'peer-1',
      name: 'RemotePeer',
      x: 50,
      y: 50,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
      outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
      pomo: 'none',
    };

    mockTransport.playersCb!(new Map([['peer-1', p1]]));
    const remotePeer = netSync.remotePlayers.get('peer-1')!;
    const showEmoteSpy = vi.spyOn(remotePeer, 'showEmote');

    mockTransport.emoteCb!('peer-1', 'sparkle');
    expect(showEmoteSpy).toHaveBeenCalledWith('sparkle');

    netSync.destroy();
  });

  it('sends assignedName when set, or falls back to avatar/storage custom name when null (P2P)', () => {
    StorageManager.reset();
    StorageManager.update({
      profile: {
        name: 'CustomPlayer',
        outfit: { baseId: 'char_base', hatId: 'none', colorHex: '#ffffff' },
      },
    });

    const mockPlayer = {
      getLocalState: () => ({
        x: 0,
        y: 0,
        zone: 'forest' as const,
        facing: 'down' as const,
        action: 'idle' as const,
      }),
      assignedName: 'Mossy Fox' as string | null,
      avatar: {
        playerName: 'AvatarCustom',
        outfit: { baseId: 'char_base', hatId: 'none' as const, colorHex: '#ffffff' },
      },
    } as any;

    const netSync = new NetSync(mockTransport, {
      localPlayer: mockPlayer,
      autoStart: false,
    });

    // 1. When localPlayer.assignedName is set, outgoing state uses it
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Mossy Fox' })
    );

    // 2. When localPlayer.assignedName is null (the P2P case), uses avatar custom name
    mockPlayer.assignedName = null;
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'AvatarCustom' })
    );

    // 3. When avatar is not present either, falls back to StorageManager profile.name
    mockPlayer.avatar = undefined;
    netSync.tick();
    expect(mockTransport.sendLocalState).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'CustomPlayer' })
    );

    netSync.destroy();
    StorageManager.reset();
  });
});
