import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrysteroTransport } from './TrysteroTransport';
import type { PlayerNetState } from '@lofi/shared';

function createMockRoom() {
  let peerJoinCb: ((peerId: string) => void) | null = null;
  let peerLeaveCb: ((peerId: string) => void) | null = null;
  const actionReceivers = new Map<string, (data: any, peerId: string) => void>();
  const actionSenders = new Map<string, any>();
  let peers: Record<string, any> = {};

  const room = {
    makeAction: vi.fn((actionName: string) => {
      const sendFn = vi.fn();
      actionSenders.set(actionName, sendFn);
      const onReceiveFn = vi.fn((cb: any) => {
        actionReceivers.set(actionName, cb);
      });
      return [sendFn, onReceiveFn];
    }),
    onPeerJoin: vi.fn((cb: any) => {
      peerJoinCb = cb;
    }),
    onPeerLeave: vi.fn((cb: any) => {
      peerLeaveCb = cb;
    }),
    getPeers: vi.fn(() => peers),
    leaveRoom: vi.fn(),
  };

  return {
    room,
    triggerPeerJoin: (pId: string) => peerJoinCb?.(pId),
    triggerPeerLeave: (pId: string) => peerLeaveCb?.(pId),
    triggerAction: (name: string, data: any, pId: string) =>
      actionReceivers.get(name)?.(data, pId),
    getActionSender: (name: string) => actionSenders.get(name),
    setPeers: (newPeers: Record<string, any>) => {
      peers = newPeers;
    },
  };
}

describe('TrysteroTransport', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validPlayerPayload: Omit<PlayerNetState, 'id'> = {
    name: 'Alice',
    x: 120,
    y: 80,
    zone: 'forest',
    facing: 'down',
    action: 'idle',
    outfit: {
      baseId: 'base1',
      hatId: 'straw',
      colorHex: '#4a7c59',
    },
    pomo: 'none',
  };

  // Acceptance criterion:
  // Test (mocked Trystero): a valid player from peer A appears in onPlayersChange; an invalid one (x: 'abc') is ignored.
  it('Test (mocked Trystero): a valid player from peer A appears in onPlayersChange; an invalid one (x: \'abc\') is ignored', async () => {
    const mock = createMockRoom();
    const joinRoomFn = vi.fn(() => mock.room);

    const transport = new TrysteroTransport('pine-100', { joinRoomFn: joinRoomFn as any });
    await transport.connect();

    let lastPlayers: Map<string, PlayerNetState> = new Map();
    transport.onPlayersChange((players) => {
      lastPlayers = players;
    });

    // Valid player message from peer A
    mock.triggerAction('player', validPlayerPayload, 'peerA');

    expect(lastPlayers.has('peerA')).toBe(true);
    const peerA = lastPlayers.get('peerA')!;
    expect(peerA.id).toBe('peerA');
    expect(peerA.name).toBe('Alice');
    expect(peerA.x).toBe(120);
    expect(peerA.y).toBe(80);

    // Invalid player message (x: 'abc') from peer B
    mock.triggerAction('player', { ...validPlayerPayload, x: 'abc' }, 'peerB');

    // peer B is ignored
    expect(lastPlayers.has('peerB')).toBe(false);
    expect(lastPlayers.size).toBe(1);

    transport.disconnect();
  });

  // Acceptance criterion:
  // Test: after onPeerLeave(A), A is removed.
  it('Test: after onPeerLeave(A), A is removed', async () => {
    const mock = createMockRoom();
    const transport = new TrysteroTransport('pine-100', {
      joinRoomFn: (() => mock.room) as any,
    });
    await transport.connect();

    let lastPlayers: Map<string, PlayerNetState> = new Map();
    transport.onPlayersChange((players) => {
      lastPlayers = players;
    });

    // Add peer A
    mock.triggerAction('player', validPlayerPayload, 'peerA');
    expect(lastPlayers.has('peerA')).toBe(true);

    // Trigger onPeerLeave('peerA')
    mock.triggerPeerLeave('peerA');

    expect(lastPlayers.has('peerA')).toBe(false);
    expect(lastPlayers.size).toBe(0);

    transport.disconnect();
  });

  // Acceptance criterion:
  // Test: with 9 peers present 2 s after joining, the status becomes room_full and the room is left; with 8 it stays connected.
  it('Test: with 9 peers present 2 s after joining, the status becomes room_full and the room is left; with 8 it stays connected', async () => {
    vi.useFakeTimers();

    // Case 1: 9 peers present -> room_full and room is left
    {
      const mock9 = createMockRoom();
      const ninePeers: Record<string, any> = {};
      for (let i = 1; i <= 9; i++) {
        ninePeers[`peer_${i}`] = {};
      }
      mock9.setPeers(ninePeers);

      const transport9 = new TrysteroTransport('pine-100', {
        joinRoomFn: (() => mock9.room) as any,
      });

      let status9 = '';
      transport9.onStatusChange((s) => {
        status9 = s;
      });

      await transport9.connect();
      expect(status9).toBe('connected');

      // Fast-forward 2 s
      vi.advanceTimersByTime(2000);

      expect(status9).toBe('room_full');
      expect(mock9.room.leaveRoom).toHaveBeenCalled();
    }

    // Case 2: 8 peers present -> stays connected
    {
      const mock8 = createMockRoom();
      const eightPeers: Record<string, any> = {};
      for (let i = 1; i <= 8; i++) {
        eightPeers[`peer_${i}`] = {};
      }
      mock8.setPeers(eightPeers);

      const transport8 = new TrysteroTransport('pine-100', {
        joinRoomFn: (() => mock8.room) as any,
      });

      let status8 = '';
      transport8.onStatusChange((s) => {
        status8 = s;
      });

      await transport8.connect();
      expect(status8).toBe('connected');

      // Fast-forward 2 s
      vi.advanceTimersByTime(2000);

      expect(status8).toBe('connected');
      expect(mock8.room.leaveRoom).not.toHaveBeenCalled();

      transport8.disconnect();
    }
  });

  // Acceptance criterion:
  // Test: a peer sending 30 messages within 1 s has messages after the 15th dropped.
  it('Test: a peer sending 30 messages within 1 s has messages after the 15th dropped', async () => {
    let mockTime = 1000;
    const mock = createMockRoom();
    const transport = new TrysteroTransport('pine-100', {
      joinRoomFn: (() => mock.room) as any,
      clock: () => mockTime,
    });
    await transport.connect();

    let updateCount = 0;
    transport.onPlayersChange((players) => {
      if (players.has('peerA')) {
        updateCount++;
      }
    });

    // Send 30 valid player state updates from peerA within the same second (t = 1000)
    for (let i = 1; i <= 30; i++) {
      mock.triggerAction('player', { ...validPlayerPayload, x: i * 10 }, 'peerA');
    }

    // Exactly 15 messages should be accepted and applied; messages 16..30 dropped
    expect(updateCount).toBe(15);

    // After 1 second passes (t = 2100)
    mockTime = 2100;
    mock.triggerAction('player', { ...validPlayerPayload, x: 999 }, 'peerA');
    expect(updateCount).toBe(16);

    transport.disconnect();
  });

  it('peer that sends nothing for 10 s is removed', async () => {
    let mockTime = 1000;
    vi.useFakeTimers();

    const mock = createMockRoom();
    const transport = new TrysteroTransport('pine-100', {
      joinRoomFn: (() => mock.room) as any,
      clock: () => mockTime,
    });
    await transport.connect();

    let lastPlayers: Map<string, PlayerNetState> = new Map();
    transport.onPlayersChange((players) => {
      lastPlayers = players;
    });

    mock.triggerAction('player', validPlayerPayload, 'peerA');
    expect(lastPlayers.has('peerA')).toBe(true);

    // Advance 9.5 seconds: still present
    mockTime += 9500;
    vi.advanceTimersByTime(9500);
    expect(lastPlayers.has('peerA')).toBe(true);

    // Advance 1 more second (total 10.5 s): peerA removed
    mockTime += 1000;
    vi.advanceTimersByTime(1000);
    expect(lastPlayers.has('peerA')).toBe(false);

    transport.disconnect();
  });

  it('player state is sent directly to newly joined peer on onPeerJoin', async () => {
    const mock = createMockRoom();
    const transport = new TrysteroTransport('pine-100', {
      joinRoomFn: (() => mock.room) as any,
    });
    await transport.connect();

    // Local player state broadcast
    transport.sendLocalState(validPlayerPayload);
    const sendPlayer = mock.getActionSender('player');
    expect(sendPlayer).toHaveBeenCalledWith(validPlayerPayload);

    // Newly joined peer joins
    mock.triggerPeerJoin('newPeer123');
    // State is sent directly to newPeer123
    expect(sendPlayer).toHaveBeenCalledWith(validPlayerPayload, 'newPeer123');

    transport.disconnect();
  });
});
