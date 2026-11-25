import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EmoteId, PlayerNetState } from '@lofi/shared';
import { WebSocketTransport } from './WebSocketTransport';
import { createTransport, registerTransport, unregisterTransport } from './createTransport';
import { gameEvents } from '../engine/events';

class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;

  public url: string;
  public readyState: number = MockWebSocket.CONNECTING;
  public sentMessages: string[] = [];

  public onopen: ((event: any) => void) | null = null;
  public onmessage: ((event: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  public triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen({});
    }
  }

  public triggerMessage(data: string | object): void {
    if (this.onmessage) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      this.onmessage({ data: payload });
    }
  }

  public triggerClose(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  public triggerError(err: any = {}): void {
    if (this.onerror) {
      this.onerror(err);
    }
  }
}

describe('WebSocketTransport', () => {
  let createdSockets: MockWebSocket[] = [];
  const webSocketFactory = (url: string) => {
    const ws = new MockWebSocket(url);
    createdSockets.push(ws);
    return ws as any;
  };

  beforeEach(() => {
    createdSockets = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    createdSockets = [];
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (mock WebSocket): welcome with 2 others yields a players map of size 2 excluding your own id; snap with left:[a] removes a.
  it('welcome with 2 others yields a players map of size 2 excluding your own id; snap with left:[a] removes a', async () => {
    const transport = new WebSocketTransport({
      webSocketFactory,
      url: 'ws://localhost:8080/ws',
    });

    let currentPlayers = new Map<string, PlayerNetState>();
    transport.onPlayersChange((players) => {
      currentPlayers = players;
    });

    await transport.connect();
    expect(createdSockets.length).toBe(1);
    createdSockets[0].triggerOpen();

    // Server sends welcome with 3 players including the client's own id
    const myId = 'player-me';
    const other1: PlayerNetState = {
      id: 'player-alice',
      name: 'Alice',
      x: 100,
      y: 120,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
      outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#ffffff' },
      pomo: 'none',
    };
    const other2: PlayerNetState = {
      id: 'player-bob',
      name: 'Bob',
      x: 200,
      y: 220,
      zone: 'forest',
      facing: 'left',
      action: 'walk',
      outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#4a7c59' },
      pomo: 'focus',
    };
    const meState: PlayerNetState = {
      id: myId,
      name: 'Me',
      x: 50,
      y: 50,
      zone: 'forest',
      facing: 'right',
      action: 'idle',
      outfit: { baseId: 'b0', hatId: 'h0', colorHex: '#000000' },
      pomo: 'none',
    };

    createdSockets[0].triggerMessage({
      t: 'welcome',
      id: myId,
      players: [meState, other1, other2],
    });

    // Own id is excluded: size should be 2
    expect(currentPlayers.size).toBe(2);
    expect(currentPlayers.has(myId)).toBe(false);
    expect(currentPlayers.get('player-alice')).toEqual(other1);
    expect(currentPlayers.get('player-bob')).toEqual(other2);

    // Server sends snap removing Alice
    createdSockets[0].triggerMessage({
      t: 'snap',
      players: [],
      left: ['player-alice'],
    });

    // Alice is removed, Bob remains: size should be 1
    expect(currentPlayers.size).toBe(1);
    expect(currentPlayers.has('player-alice')).toBe(false);
    expect(currentPlayers.get('player-bob')).toEqual(other2);
  });

  // Acceptance criterion:
  // Test (fake timers): an unexpected close retries at about 1 s, 2 s, 4 s … capped at 30 s; status goes reconnecting → connected on success.
  it('an unexpected close retries at about 1 s, 2 s, 4 s … capped at 30 s; status goes reconnecting → connected on success', async () => {
    vi.useFakeTimers();
    try {
      const transport = new WebSocketTransport({
        webSocketFactory,
        url: 'ws://localhost:8080/ws',
        random: () => 0.5, // 0.8 + 0.5 * 0.4 = 1.0 (exact backoff base)
      });

      let statusList: string[] = [];
      transport.onStatusChange((s) => {
        statusList.push(s);
      });

      await transport.connect();
      expect(createdSockets.length).toBe(1);
      createdSockets[0].triggerOpen();
      expect(transport.status).toBe('connected');

      // 1st unexpected close: backoff ~1 s (1000 ms)
      createdSockets[0].triggerClose(1006, 'Abnormal Closure');
      expect(transport.status).toBe('reconnecting');
      vi.advanceTimersByTime(999);
      expect(createdSockets.length).toBe(1); // not yet
      vi.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(2); // retried at ~1 s

      // 2nd unexpected close: backoff ~2 s (2000 ms)
      createdSockets[1].triggerClose(1006);
      expect(transport.status).toBe('reconnecting');
      vi.advanceTimersByTime(1999);
      expect(createdSockets.length).toBe(2);
      vi.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(3); // retried at ~2 s

      // 3rd unexpected close: backoff ~4 s (4000 ms)
      createdSockets[2].triggerClose(1006);
      vi.advanceTimersByTime(3999);
      expect(createdSockets.length).toBe(3);
      vi.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(4); // retried at ~4 s

      // 4th unexpected close: backoff ~8 s (8000 ms)
      createdSockets[3].triggerClose(1006);
      vi.advanceTimersByTime(8000);
      expect(createdSockets.length).toBe(5);

      // 5th unexpected close: backoff ~16 s (16000 ms)
      createdSockets[4].triggerClose(1006);
      vi.advanceTimersByTime(16000);
      expect(createdSockets.length).toBe(6);

      // 6th unexpected close: capped at 30 s (30000 ms)
      createdSockets[5].triggerClose(1006);
      vi.advanceTimersByTime(29999);
      expect(createdSockets.length).toBe(6);
      vi.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(7); // retried at 30 s

      // 7th unexpected close: still capped at 30 s
      createdSockets[6].triggerClose(1006);
      vi.advanceTimersByTime(30000);
      expect(createdSockets.length).toBe(8);

      // Reconnect succeeds!
      createdSockets[7].triggerOpen();
      expect(transport.status).toBe('connected');
      // hello message re-sent
      expect(createdSockets[7].sentMessages).toContainEqual(
        expect.stringContaining('"t":"hello"')
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // Acceptance criterion:
  // Test: close 4001 sets room_full and does not retry.
  it('close 4001 sets room_full and does not retry', async () => {
    vi.useFakeTimers();
    try {
      const transport = new WebSocketTransport({
        webSocketFactory,
        url: 'ws://localhost:8080/ws',
      });

      await transport.connect();
      expect(createdSockets.length).toBe(1);
      createdSockets[0].triggerOpen();
      expect(transport.status).toBe('connected');

      // Server closes with code 4001 (room full)
      createdSockets[0].triggerClose(4001, 'Lobby full');
      expect(transport.status).toBe('room_full');

      // Advance timers by a long time; no reconnect should occur
      vi.advanceTimersByTime(60000);
      expect(createdSockets.length).toBe(1);
      expect(transport.status).toBe('room_full');
    } finally {
      vi.useRealTimers();
    }
  });

  it('{t:"full"} message sets room_full and does not retry', async () => {
    vi.useFakeTimers();
    try {
      const transport = new WebSocketTransport({
        webSocketFactory,
        url: 'ws://localhost:8080/ws',
      });

      await transport.connect();
      createdSockets[0].triggerOpen();

      // Server sends { t: 'full' }
      createdSockets[0].triggerMessage({ t: 'full' });
      expect(transport.status).toBe('room_full');

      vi.advanceTimersByTime(60000);
      expect(createdSockets.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Acceptance criterion:
  // Test: close 4008 retries only after ≥ 30 s.
  it('close 4008 retries only after >= 30 s', async () => {
    vi.useFakeTimers();
    try {
      const transport = new WebSocketTransport({
        webSocketFactory,
        url: 'ws://localhost:8080/ws',
      });

      await transport.connect();
      createdSockets[0].triggerOpen();
      expect(transport.status).toBe('connected');

      // Server closes with code 4008 (rate limited)
      createdSockets[0].triggerClose(4008, 'Rate limited');
      expect(transport.status).toBe('reconnecting');

      // Advance 29.9 seconds -> no retry yet
      vi.advanceTimersByTime(29999);
      expect(createdSockets.length).toBe(1);

      // Advance 1 ms (reaches 30s) -> retry starts
      vi.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // Acceptance criterion:
  // Test: in spectator mode, no hello or state is ever sent and the URL has spectator=1.
  it('in spectator mode, no hello or state is ever sent and the URL has spectator=1', async () => {
    const transport = new WebSocketTransport({
      webSocketFactory,
      url: 'ws://localhost:8080/ws',
      spectator: true,
    });

    await transport.connect();
    expect(createdSockets.length).toBe(1);
    expect(createdSockets[0].url).toContain('spectator=1');

    createdSockets[0].triggerOpen();
    // In spectator mode: NO hello sent on open
    expect(createdSockets[0].sentMessages.length).toBe(0);

    // Calling sendLocalState should NOT send anything
    transport.sendLocalState({
      name: 'Ghost',
      x: 10,
      y: 20,
      zone: 'forest',
      facing: 'down',
      action: 'idle',
      pomo: 'none',
      outfit: { baseId: 'b', hatId: 'h', colorHex: '#000' },
    });
    expect(createdSockets[0].sentMessages.length).toBe(0);

    // Calling sendEmote should NOT send anything
    transport.sendEmote('heart');
    expect(createdSockets[0].sentMessages.length).toBe(0);
  });

  // Acceptance criterion:
  // Test: on an https: page with a ws:// URL, no WebSocket is constructed and the message shows.
  it('on an https: page with a ws:// URL, no WebSocket is constructed and the message shows', async () => {
    let toastMessage: string | null = null;
    const unsub = gameEvents.on('toast', ({ message }) => {
      toastMessage = message;
    });

    try {
      const transport = new WebSocketTransport({
        webSocketFactory,
        url: 'ws://localhost:8080/ws',
        pageProtocol: 'https:',
      });

      await transport.connect();

      // No WebSocket was constructed
      expect(createdSockets.length).toBe(0);
      expect(transport.status).toBe('disconnected');
      expect(transport.errorMessage).toBe('Public lobby needs a wss:// URL');
      expect(toastMessage).toBe('Public lobby needs a wss:// URL');
    } finally {
      unsub();
    }
  });

  it('drops invalid incoming messages without throwing', async () => {
    const transport = new WebSocketTransport({
      webSocketFactory,
      url: 'ws://localhost:8080/ws',
    });

    await transport.connect();
    createdSockets[0].triggerOpen();

    expect(() => {
      createdSockets[0].triggerMessage('not-json');
      createdSockets[0].triggerMessage(JSON.stringify({ t: 'unknown_type' }));
      createdSockets[0].triggerMessage(JSON.stringify({ t: 'welcome', id: '' })); // invalid id
    }).not.toThrow();
  });

  it('forwards incoming remote emotes to onEmote listeners', async () => {
    const transport = new WebSocketTransport({
      webSocketFactory,
      url: 'ws://localhost:8080/ws',
    });

    const receivedEmotes: Array<{ id: string; e: EmoteId }> = [];
    transport.onEmote((playerId, e) => {
      receivedEmotes.push({ id: playerId, e });
    });

    await transport.connect();
    createdSockets[0].triggerOpen();
    createdSockets[0].triggerMessage({ t: 'welcome', id: 'my-id', players: [] });

    // Incoming emote from other player
    createdSockets[0].triggerMessage({ t: 'emote', id: 'other-player', e: 'coffee' });
    expect(receivedEmotes).toEqual([{ id: 'other-player', e: 'coffee' }]);

    // Incoming emote from self is dropped
    createdSockets[0].triggerMessage({ t: 'emote', id: 'my-id', e: 'sparkle' });
    expect(receivedEmotes.length).toBe(1);
  });

  it('createTransport returns WebSocketTransport for ?room=public when registered', () => {
    registerTransport('public', () => new WebSocketTransport({ webSocketFactory }));
    try {
      const transport = createTransport('?room=public');
      expect(transport.mode).toBe('public');
      expect(transport).toBeInstanceOf(WebSocketTransport);
    } finally {
      unregisterTransport('public');
      // Re-register default
      registerTransport('public', () => new WebSocketTransport());
    }
  });

  it('welcome message with name sets assignedName and emits assignedNameChanged', async () => {
    const transport = new WebSocketTransport({ webSocketFactory });
    await transport.connect();
    createdSockets[0].triggerOpen();

    let assigned: string | null = null;
    const unsub = gameEvents.on('assignedNameChanged', ({ name }) => {
      assigned = name;
    });

    createdSockets[0].triggerMessage({
      t: 'welcome',
      id: 'my-id',
      name: 'Sleepy Hare',
      players: [],
    });

    expect(transport.assignedName).toBe('Sleepy Hare');
    expect(assigned).toBe('Sleepy Hare');
    unsub();
  });
});
