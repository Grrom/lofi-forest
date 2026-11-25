import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import {
  WORLD_WIDTH_PX,
  type ServerSnapMsg,
  type ServerWelcomeMsg,
} from '@lofi/shared';
import { startServer } from './index.js';

interface TestClient {
  ws: WebSocket;
  messages: unknown[];
  waitForMessage: <T = unknown>(
    predicate?: (msg: unknown) => boolean,
    timeoutMs?: number
  ) => Promise<T>;
  send: (data: unknown) => void;
  close: () => void;
  terminate: () => void;
}

function createTestClient(
  port: number,
  path = '/ws',
  options?: { headers?: Record<string, string>; origin?: string }
): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, {
      headers: options?.headers,
      origin: options?.origin,
    });

    const messages: unknown[] = [];
    const waiters: Array<{
      predicate: (msg: unknown) => boolean;
      resolve: (msg: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }> = [];

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        parsed = data.toString();
      }

      // Check if any waiter matches
      for (let i = 0; i < waiters.length; i++) {
        const waiter = waiters[i];
        if (waiter.predicate(parsed)) {
          clearTimeout(waiter.timer);
          waiters.splice(i, 1);
          waiter.resolve(parsed);
          return;
        }
      }

      messages.push(parsed);
    });

    ws.once('open', () => {
      resolve({
        ws,
        messages,
        send: (data: unknown) => {
          ws.send(typeof data === 'string' ? data : JSON.stringify(data));
        },
        waitForMessage: <T = unknown>(
          predicate = (_m: unknown) => true,
          timeoutMs = 2000
        ): Promise<T> => {
          // Check buffered messages first
          for (let i = 0; i < messages.length; i++) {
            if (predicate(messages[i])) {
              const [found] = messages.splice(i, 1);
              return Promise.resolve(found as T);
            }
          }

          return new Promise<T>((resWait, rejWait) => {
            const timer = setTimeout(() => {
              const idx = waiters.findIndex((w) => w.resolve === (resWait as unknown));
              if (idx !== -1) waiters.splice(idx, 1);
              rejWait(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
            }, timeoutMs);

            waiters.push({
              predicate,
              resolve: resWait as (msg: unknown) => void,
              reject: rejWait,
              timer,
            });
          });
        },
        close: () => ws.close(),
        terminate: () => ws.terminate(),
      });
    });

    ws.once('error', reject);
  });
}

describe('public-server integration tests', () => {
  // Acceptance criterion:
  // Test: /health reports correct counts.
  it('Test: /health reports correct counts.', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      // Initially 0 players, 0 spectators
      let res = await fetch(`http://127.0.0.1:${instance.port}/health`);
      expect(res.status).toBe(200);
      let data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.players).toBe(0);
      expect(data.spectators).toBe(0);
      expect(data.uptimeSec).toBeGreaterThanOrEqual(0);

      // Connect player 1
      const p1 = await createTestClient(instance.port, '/ws');
      clients.push(p1);
      p1.send({
        t: 'hello',
        name: 'P1',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#fff' },
      });
      await p1.waitForMessage((m: any) => m.t === 'welcome');

      // Connect player 2
      const p2 = await createTestClient(instance.port, '/ws');
      clients.push(p2);
      p2.send({
        t: 'hello',
        name: 'P2',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#000' },
      });
      await p2.waitForMessage((m: any) => m.t === 'welcome');

      // Connect spectator
      const spec = await createTestClient(instance.port, '/ws?spectator=1');
      clients.push(spec);
      const specWelcome = await spec.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(specWelcome.t).toBe('welcome');

      res = await fetch(`http://127.0.0.1:${instance.port}/health`);
      data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.players).toBe(2);
      expect(data.spectators).toBe(1);

      // Disconnect one player
      p1.close();
      await new Promise((r) => setTimeout(r, 50));

      res = await fetch(`http://127.0.0.1:${instance.port}/health`);
      data = await res.json();
      expect(data.players).toBe(1);
      expect(data.spectators).toBe(1);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Integration (real server on an ephemeral port): two clients hello; one sends state; the other receives a snap with it within 250 ms, with coordinates clamped.
  it('Integration (real server on an ephemeral port): two clients hello; one sends state; the other receives a snap with it within 250 ms, with coordinates clamped.', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2);

      // Both clients hello
      c1.send({
        t: 'hello',
        name: 'Alice',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#ff0000' },
      });
      const w1 = await c1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w1.t).toBe('welcome');

      c2.send({
        t: 'hello',
        name: 'Bob',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#00ff00' },
      });
      const w2 = await c2.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w2.t).toBe('welcome');

      // One sends state with out-of-bounds coordinates
      const sendTime = Date.now();
      c1.send({
        t: 'state',
        x: WORLD_WIDTH_PX + 500,
        y: -200,
        zone: 'forest',
        facing: 'left',
        action: 'walk',
        pomo: 'focus',
      });

      // The other receives a snap with it within 250 ms, with coordinates clamped
      const snap = await c2.waitForMessage<ServerSnapMsg>((m: any) => m.t === 'snap', 250);
      const elapsed = Date.now() - sendTime;
      expect(elapsed).toBeLessThanOrEqual(250);

      expect(snap.t).toBe('snap');
      expect(snap.players.length).toBeGreaterThanOrEqual(1);

      const aliceState = snap.players.find((p) => p.id === w1.id);
      expect(aliceState).toBeDefined();
      expect(aliceState!.x).toBe(WORLD_WIDTH_PX);
      expect(aliceState!.y).toBe(0);
      expect(aliceState!.name).toBe(w1.name);
      expect(aliceState!.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+\d?$/);
      expect(aliceState!.zone).toBe('forest');
      expect(aliceState!.action).toBe('walk');
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Integration: with MAX_PLAYERS=1, the second player gets {t:'full'} and close 4001, while a spectator still connects.
  it("Integration: with MAX_PLAYERS=1, the second player gets {t:'full'} and close 4001, while a spectator still connects.", async () => {
    const instance = await startServer(0, '127.0.0.1', {
      maxPlayers: 1,
      maxSpectators: 20,
    });
    const clients: Array<{ ws: WebSocket } | TestClient> = [];
    try {
      // First player connects and hellos
      const p1 = await createTestClient(instance.port, '/ws');
      clients.push(p1);
      p1.send({
        t: 'hello',
        name: 'P1',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#fff' },
      });
      const w1 = await p1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w1.t).toBe('welcome');

      // Second player connects and hellos
      const p2 = await createTestClient(instance.port, '/ws');
      clients.push(p2);

      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        p2.ws.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() });
        });
      });

      p2.send({
        t: 'hello',
        name: 'P2',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#000' },
      });

      const fullMsg = await p2.waitForMessage<{ t: string }>((m: any) => m.t === 'full');
      expect(fullMsg).toEqual({ t: 'full' });

      const closeEvent = await closePromise;
      expect(closeEvent.code).toBe(4001);

      // Spectator still connects
      const spec = await createTestClient(instance.port, '/ws?spectator=1');
      clients.push(spec);
      const specWelcome = await spec.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(specWelcome.t).toBe('welcome');
      expect(spec.ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      clients.forEach((c) => {
        if ('terminate' in c) c.terminate();
        else c.ws.terminate();
      });
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Integration: 40 instant messages close the socket with 4008.
  it('Integration: 40 instant messages close the socket with 4008.', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c = await createTestClient(instance.port, '/ws');
      clients.push(c);

      const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
        c.ws.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() });
        });
      });

      // Send 40 messages instantly
      for (let i = 0; i < 40; i++) {
        c.send({
          t: 'state',
          x: 10,
          y: 10,
          zone: 'forest',
          facing: 'down',
          action: 'idle',
          pomo: 'none',
        });
      }

      const closeInfo = await closePromise;
      expect(closeInfo.code).toBe(4008);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Integration: with MAX_CONN_PER_IP=1, a second connection from the same address is rejected.
  it('Integration: with MAX_CONN_PER_IP=1, a second connection from the same address is rejected.', async () => {
    const instance = await startServer(0, '127.0.0.1', { maxConnPerIp: 1 });
    const clients: Array<{ terminate: () => void }> = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      clients.push(c1);
      expect(c1.ws.readyState).toBe(WebSocket.OPEN);

      // Second connection from same IP (127.0.0.1)
      const c2 = new WebSocket(`ws://127.0.0.1:${instance.port}/ws`);
      clients.push(c2);

      const status = await new Promise<number>((resolve, reject) => {
        c2.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
        });
        c2.on('open', () => reject(new Error('Connection should have been rejected')));
        c2.on('error', () => {
          // expected when unexpected-response occurs
        });
      });

      expect(status).toBe(429);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Integration: with TRUST_CF_HEADER=0, a spoofed CF-Connecting-IP doesn't bypass the cap; with TRUST_CF_HEADER=1, two different header IPs are both accepted.
  it("Integration: with TRUST_CF_HEADER=0, a spoofed CF-Connecting-IP doesn't bypass the cap; with TRUST_CF_HEADER=1, two different header IPs are both accepted.", async () => {
    // Part 1: TRUST_CF_HEADER = 0, spoofed header should not bypass cap of 1
    const s0 = await startServer(0, '127.0.0.1', {
      maxConnPerIp: 1,
      trustCfHeader: false,
    });
    const clients0: Array<{ terminate: () => void }> = [];
    try {
      const c1 = await createTestClient(s0.port, '/ws', {
        headers: { 'CF-Connecting-IP': '198.51.100.1' },
      });
      clients0.push(c1);

      const c2 = new WebSocket(`ws://127.0.0.1:${s0.port}/ws`, {
        headers: { 'CF-Connecting-IP': '198.51.100.2' },
      });
      clients0.push(c2);

      const status0 = await new Promise<number>((resolve, reject) => {
        c2.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
        });
        c2.on('open', () => reject(new Error('Connection should not have opened')));
        c2.on('error', () => {});
      });

      expect(status0).toBe(429);
    } finally {
      clients0.forEach((c) => c.terminate());
      await s0.close();
    }

    // Part 2: TRUST_CF_HEADER = 1, two different header IPs are both accepted
    const s1 = await startServer(0, '127.0.0.1', {
      maxConnPerIp: 1,
      trustCfHeader: true,
    });
    const clients1: Array<{ terminate: () => void }> = [];
    try {
      const c1 = await createTestClient(s1.port, '/ws', {
        headers: { 'CF-Connecting-IP': '198.51.100.1' },
      });
      clients1.push(c1);

      const c2 = await createTestClient(s1.port, '/ws', {
        headers: { 'CF-Connecting-IP': '198.51.100.2' },
      });
      clients1.push(c2);

      expect(c1.ws.readyState).toBe(WebSocket.OPEN);
      expect(c2.ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      clients1.forEach((c) => c.terminate());
      await s1.close();
    }
  });

  // Acceptance criterion:
  // Integration: a BANNED_IPS address is rejected, and so is an origin outside ALLOWED_ORIGINS.
  it('Integration: a BANNED_IPS address is rejected, and so is an origin outside ALLOWED_ORIGINS.', async () => {
    // 1. Banned IP rejection
    const bannedServer = await startServer(0, '127.0.0.1', {
      bannedIps: ['127.0.0.1'],
    });
    try {
      const wsBanned = new WebSocket(`ws://127.0.0.1:${bannedServer.port}/ws`);
      const status = await new Promise<number>((resolve, reject) => {
        wsBanned.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
        });
        wsBanned.on('open', () => reject(new Error('Should not have opened')));
        wsBanned.on('error', () => {});
      });
      expect(status).toBe(403);
    } finally {
      await bannedServer.close();
    }

    // 2. Disallowed origin rejection & allowed origin acceptance
    const originServer = await startServer(0, '127.0.0.1', {
      allowedOrigins: ['https://lofiforest.com'],
    });
    try {
      // Disallowed origin
      const wsDisallowed = new WebSocket(`ws://127.0.0.1:${originServer.port}/ws`, {
        headers: { Origin: 'https://evil.com' },
      });
      const disallowedStatus = await new Promise<number>((resolve, reject) => {
        wsDisallowed.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
        });
        wsDisallowed.on('open', () => reject(new Error('Should not have opened')));
        wsDisallowed.on('error', () => {});
      });
      expect(disallowedStatus).toBe(403);

      // Allowed origin
      const wsAllowed = await createTestClient(originServer.port, '/ws', {
        origin: 'https://lofiforest.com',
      });
      expect(wsAllowed.ws.readyState).toBe(WebSocket.OPEN);
      wsAllowed.terminate();
    } finally {
      await originServer.close();
    }
  });

  // Acceptance criterion:
  // Integration: a frame over 512 bytes is not applied.
  it('Integration: a frame over 512 bytes is not applied.', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2);

      c1.send({
        t: 'hello',
        name: 'Player1',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#fff' },
      });
      await c1.waitForMessage((m: any) => m.t === 'welcome');

      c2.send({
        t: 'hello',
        name: 'Player2',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#000' },
      });
      await c2.waitForMessage((m: any) => m.t === 'welcome');

      // First send a valid state at x = 50
      c1.send({
        t: 'state',
        x: 50,
        y: 50,
        zone: 'forest',
        facing: 'left',
        action: 'walk',
        pomo: 'focus',
      });
      const snap1 = await c2.waitForMessage<ServerSnapMsg>((m: any) => m.t === 'snap');
      expect(snap1.players[0].x).toBe(50);

      // Now send an oversized frame (> 512 bytes) with x = 300
      const largePayload = JSON.stringify({
        t: 'state',
        x: 300,
        y: 50,
        zone: 'forest',
        facing: 'left',
        action: 'walk',
        pomo: 'focus',
        extra: 'x'.repeat(600),
      });
      expect(Buffer.byteLength(largePayload, 'utf8')).toBeGreaterThan(512);
      c1.send(largePayload);

      // Wait a moment (oversized frame should be dropped and not broadcast)
      let snapAfterOversized: ServerSnapMsg | null = null;
      try {
        snapAfterOversized = await c2.waitForMessage<ServerSnapMsg>(
          (m: any) => m.t === 'snap' && m.players.some((p: any) => p.x === 300),
          150
        );
      } catch {
        // Expected timeout since no snap was sent!
      }
      expect(snapAfterOversized).toBeNull();

      // Now send a valid state at x = 120, which should be applied
      c1.send({
        t: 'state',
        x: 120,
        y: 50,
        zone: 'forest',
        facing: 'left',
        action: 'walk',
        pomo: 'focus',
      });
      const snap2 = await c2.waitForMessage<ServerSnapMsg>(
        (m: any) => m.t === 'snap' && m.players.some((p: any) => p.x === 120),
        250
      );
      expect(snap2.players.some((p) => p.x === 120)).toBe(true);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Additional behavior test: Emote broadcast to others at most 1/s
  it('broadcasts emote to others at most 1 per second per player', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2);

      c1.send({
        t: 'hello',
        name: 'P1',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#fff' },
      });
      const w1 = await c1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');

      c2.send({
        t: 'hello',
        name: 'P2',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#000' },
      });
      await c2.waitForMessage((m: any) => m.t === 'welcome');

      // c1 sends emote
      c1.send({ t: 'emote', e: 'heart' });

      // c2 receives emote
      const emoteMsg = await c2.waitForMessage<{ t: string; id: string; e: string }>(
        (m: any) => m.t === 'emote'
      );
      expect(emoteMsg).toEqual({
        t: 'emote',
        id: w1.id,
        e: 'heart',
      });

      // c1 sends another emote immediately within 1s
      c1.send({ t: 'emote', e: 'wave' });

      let secondEmote: unknown = null;
      try {
        secondEmote = await c2.waitForMessage((m: any) => m.t === 'emote', 150);
      } catch {
        // Expected timeout
      }
      expect(secondEmote).toBeNull();
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Additional behavior test: Disconnecting player is reported in snap left array
  it('reports disconnected player in snap left array', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2);

      c1.send({
        t: 'hello',
        name: 'P1',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#fff' },
      });
      const w1 = await c1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');

      c2.send({
        t: 'hello',
        name: 'P2',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#000' },
      });
      await c2.waitForMessage((m: any) => m.t === 'welcome');

      // Disconnect c1
      c1.close();

      // c2 should receive snap with w1.id in left
      const snap = await c2.waitForMessage<ServerSnapMsg>((m: any) => m.t === 'snap', 300);
      expect(snap.t).toBe('snap');
      expect(snap.left).toContain(w1.id);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Additional behavior test: Unresponsive player closed after hello timeout
  it('closes player socket if hello is not sent within helloTimeout', async () => {
    const instance = await startServer(0, '127.0.0.1', { helloTimeoutMs: 100 });
    try {
      const c = await createTestClient(instance.port, '/ws');
      const closed = await new Promise<boolean>((resolve) => {
        c.ws.on('close', () => resolve(true));
      });
      expect(closed).toBe(true);
    } finally {
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Server test: a hello with name "badword" results in a stored and broadcast name matching /^[A-Z][a-z]+ [A-Z][a-z]+\d?$/, never the sent name.
  it('Server test: a hello with name "badword" results in a stored and broadcast name matching /^[A-Z][a-z]+ [A-Z][a-z]+\d?$/, never the sent name', async () => {
    const instance = await startServer(0, '127.0.0.1');
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2);

      c1.send({
        t: 'hello',
        name: 'badword',
        outfit: { baseId: 'b1', hatId: 'h1', colorHex: '#ff0000' },
      });
      const w1 = await c1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w1.t).toBe('welcome');
      expect(w1.name).toBeDefined();
      expect(w1.name).not.toBe('badword');
      expect(w1.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+\d?$/);
      expect(w1.name!.length).toBeLessThanOrEqual(16);

      c2.send({
        t: 'hello',
        name: 'other',
        outfit: { baseId: 'b2', hatId: 'h2', colorHex: '#00ff00' },
      });
      const w2 = await c2.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w2.t).toBe('welcome');

      // c1 sends state
      c1.send({
        t: 'state',
        x: 100,
        y: 100,
        zone: 'forest',
        facing: 'down',
        action: 'idle',
        pomo: 'none',
      });

      // c2 receives snapshot
      const snap = await c2.waitForMessage<ServerSnapMsg>((m: any) => m.t === 'snap');
      const p1State = snap.players.find((p) => p.id === w1.id);
      expect(p1State).toBeDefined();
      expect(p1State!.name).not.toBe('badword');
      expect(p1State!.name).toBe(w1.name);
      expect(p1State!.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+\d?$/);
      expect(p1State!.name.length).toBeLessThanOrEqual(16);
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });

  // Acceptance criterion:
  // Server test: two players never share a name at the same time.
  it('Server test: two players never share a name at the same time', async () => {
    const instance = await startServer(0, '127.0.0.1', {
      nameRng: () => 0,
      maxConnPerIp: 10,
    });
    const clients: TestClient[] = [];
    try {
      const c1 = await createTestClient(instance.port, '/ws');
      const c2 = await createTestClient(instance.port, '/ws');
      const c3 = await createTestClient(instance.port, '/ws');
      clients.push(c1, c2, c3);

      c1.send({
        t: 'hello',
        name: 'Player1',
        outfit: { baseId: 'b', hatId: 'none', colorHex: '#fff' },
      });
      const w1 = await c1.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');

      c2.send({
        t: 'hello',
        name: 'Player2',
        outfit: { baseId: 'b', hatId: 'none', colorHex: '#fff' },
      });
      const w2 = await c2.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');

      c3.send({
        t: 'hello',
        name: 'Player3',
        outfit: { baseId: 'b', hatId: 'none', colorHex: '#fff' },
      });
      const w3 = await c3.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');

      expect(w1.name).toBe('Mossy Fox');
      expect(w2.name).toBe('Mossy Fox2');
      expect(w3.name).toBe('Mossy Fox3');

      // Then close the 'Mossy Fox2' client, wait for its close event or the next snap
      const closePromise = new Promise<void>((resolve) => {
        c2.ws.once('close', () => resolve());
      });
      c2.close();
      await closePromise;
      await c1.waitForMessage<ServerSnapMsg>(
        (m: any) => m.t === 'snap' && m.left && m.left.includes(w2.id)
      );

      // Connect a fourth player
      const c4 = await createTestClient(instance.port, '/ws');
      clients.push(c4);
      c4.send({
        t: 'hello',
        name: 'Player4',
        outfit: { baseId: 'b', hatId: 'none', colorHex: '#fff' },
      });
      const w4 = await c4.waitForMessage<ServerWelcomeMsg>((m: any) => m.t === 'welcome');
      expect(w4.name).toBeDefined();

      // Assert its name is not one of the names still in use
      const activeNames = [w1.name, w3.name];
      expect(activeNames).not.toContain(w4.name);
      expect(w4.name).toBe('Mossy Fox2');
    } finally {
      clients.forEach((c) => c.terminate());
      await instance.close();
    }
  });
});
