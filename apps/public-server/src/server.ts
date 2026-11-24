import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  clampToWorld,
  generateLobbyName,
  MAX_FRAME_BYTES,
  parseClientMessage,
  sanitizeName,
  type Outfit,
  type PlayerNetState,
  type ServerEmoteMsg,
  type ServerFullMsg,
  type ServerSnapMsg,
  type ServerWelcomeMsg,
} from '@lofi/shared';
import { RateLimiter } from './rateLimit.js';

export interface ServerConfig {
  port: number;
  host: string;
  maxPlayers: number;
  maxSpectators: number;
  maxConnPerIp: number;
  allowedOrigins: string[];
  trustCfHeader: boolean;
  bannedIps: string[];
  broadcastIntervalMs: number;
  helloTimeoutMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
}

export interface ServerInstance {
  server: http.Server;
  wss: WebSocketServer;
  port: number;
  config: ServerConfig;
  close: () => Promise<void>;
}

interface PlayerSession {
  id: string;
  name: string;
  outfit: Outfit;
  ws: WebSocket;
  state: PlayerNetState | null;
  lastEmoteTime: number;
}

interface SpectatorSession {
  id: string;
  ws: WebSocket;
}

export function normalizeIp(ip: string): string {
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice(7);
  }
  return cleaned;
}

export function getClientIp(
  req: http.IncomingMessage,
  trustCfHeader: boolean
): string {
  if (trustCfHeader) {
    const cfHeader = req.headers['cf-connecting-ip'];
    if (typeof cfHeader === 'string' && cfHeader.trim().length > 0) {
      return normalizeIp(cfHeader);
    }
    if (
      Array.isArray(cfHeader) &&
      cfHeader.length > 0 &&
      typeof cfHeader[0] === 'string'
    ) {
      return normalizeIp(cfHeader[0]);
    }
  }

  const remote = req.socket.remoteAddress || '';
  return normalizeIp(remote);
}

export function resolveConfig(options?: Partial<ServerConfig>): ServerConfig {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const bannedIpsEnv = process.env.BANNED_IPS;

  return {
    port: options?.port ?? (Number(process.env.PORT) || 8080),
    host: options?.host ?? (process.env.HOST || '0.0.0.0'),
    maxPlayers: options?.maxPlayers ?? (Number(process.env.MAX_PLAYERS) || 50),
    maxSpectators:
      options?.maxSpectators ?? (Number(process.env.MAX_SPECTATORS) || 20),
    maxConnPerIp:
      options?.maxConnPerIp ?? (Number(process.env.MAX_CONN_PER_IP) || 3),
    allowedOrigins:
      options?.allowedOrigins ??
      (allowedOriginsEnv
        ? allowedOriginsEnv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
    trustCfHeader:
      options?.trustCfHeader ?? (process.env.TRUST_CF_HEADER === '1'),
    bannedIps:
      options?.bannedIps ??
      (bannedIpsEnv
        ? bannedIpsEnv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []),
    broadcastIntervalMs: options?.broadcastIntervalMs ?? 100,
    helloTimeoutMs: options?.helloTimeoutMs ?? 5000,
    pingIntervalMs: options?.pingIntervalMs ?? 25000,
    pongTimeoutMs: options?.pongTimeoutMs ?? 60000,
  };
}

export function createServer(options?: Partial<ServerConfig>) {
  const config = resolveConfig(options);
  const startTime = Date.now();

  const players = new Map<string, PlayerSession>();
  const spectators = new Map<WebSocket, SpectatorSession>();
  const ipConnections = new Map<string, Set<WebSocket>>();
  const dirtyPlayers = new Map<string, PlayerNetState>();
  const leftPlayerIds = new Set<string>();
  const socketLastPong = new Map<WebSocket, number>();

  function getActivePlayersState(): PlayerNetState[] {
    const list: PlayerNetState[] = [];
    for (const session of players.values()) {
      if (session.state !== null) {
        list.push(session.state);
      }
    }
    return list;
  }

  const server = http.createServer((req, res) => {
    let pathname = '';
    try {
      const url = new URL(
        req.url ?? '',
        `http://${req.headers.host || 'localhost'}`
      );
      pathname = url.pathname;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
      return;
    }

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          players: players.size,
          spectators: spectators.size,
          uptimeSec: Math.floor((Date.now() - startTime) / 1000),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try {
      const url = new URL(
        req.url ?? '',
        `http://${req.headers.host || 'localhost'}`
      );
      pathname = url.pathname;
    } catch {
      socket.end(
        'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      );
      return;
    }

    if (pathname !== '/ws') {
      socket.end(
        'HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      );
      return;
    }

    const clientIp = getClientIp(req, config.trustCfHeader);

    // Reject banned IPs with HTTP 403
    const bannedNormalized = config.bannedIps.map(normalizeIp);
    if (bannedNormalized.includes(clientIp)) {
      socket.end(
        'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      );
      return;
    }

    // Reject disallowed Origin with HTTP 403
    if (config.allowedOrigins.length > 0) {
      const origin = req.headers.origin;
      if (
        !origin ||
        typeof origin !== 'string' ||
        !config.allowedOrigins.includes(origin.trim())
      ) {
        socket.end(
          'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
        );
        return;
      }
    }

    // Reject when IP already has MAX_CONN_PER_IP sockets with HTTP 429
    const activeConns = ipConnections.get(clientIp)?.size ?? 0;
    if (activeConns >= config.maxConnPerIp) {
      socket.end(
        'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      );
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = getClientIp(req, config.trustCfHeader);

    let ipSet = ipConnections.get(clientIp);
    if (!ipSet) {
      ipSet = new Set();
      ipConnections.set(clientIp, ipSet);
    }
    ipSet.add(ws);

    const rateLimiter = new RateLimiter({ capacity: 25, refillRate: 15 });
    socketLastPong.set(ws, Date.now());

    ws.on('pong', () => {
      socketLastPong.set(ws, Date.now());
    });

    let url: URL;
    try {
      url = new URL(
        req.url ?? '',
        `http://${req.headers.host || 'localhost'}`
      );
    } catch {
      ws.close();
      return;
    }

    const isSpectator = url.searchParams.get('spectator') === '1';

    if (isSpectator) {
      // Spectator cap check
      if (spectators.size >= config.maxSpectators) {
        const fullMsg: ServerFullMsg = { t: 'full' };
        ws.send(JSON.stringify(fullMsg));
        ws.close(4001, 'Lobby full');
        return;
      }

      const spectatorId = crypto.randomUUID();
      spectators.set(ws, { id: spectatorId, ws });

      // Spectator gets welcome immediately
      const welcome: ServerWelcomeMsg = {
        t: 'welcome',
        id: spectatorId,
        players: getActivePlayersState(),
      };
      ws.send(JSON.stringify(welcome));

      ws.on('message', (raw) => {
        // Frames still consume rate-limit tokens
        if (!rateLimiter.consume()) {
          ws.close(4008, 'Rate limit exceeded');
          return;
        }
        // Spectator state and emote messages are ignored
      });

      ws.on('close', () => {
        spectators.delete(ws);
        socketLastPong.delete(ws);
        const set = ipConnections.get(clientIp);
        if (set) {
          set.delete(ws);
          if (set.size === 0) ipConnections.delete(clientIp);
        }
      });

      return;
    }

    // Player logic
    let playerSession: PlayerSession | null = null;
    let helloTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (!playerSession) {
        ws.close();
      }
    }, config.helloTimeoutMs);

    ws.on('message', (raw) => {
      // Rate limit check
      if (!rateLimiter.consume()) {
        ws.close(4008, 'Rate limit exceeded');
        return;
      }

      // Frame size check (drop if > MAX_FRAME_BYTES)
      const byteLength = Buffer.isBuffer(raw)
        ? raw.length
        : typeof raw === 'string'
          ? Buffer.byteLength(raw, 'utf8')
          : (raw as ArrayBuffer).byteLength ?? 0;

      if (byteLength > MAX_FRAME_BYTES) {
        return;
      }

      const rawStr = typeof raw === 'string' ? raw : raw.toString('utf8');
      const msg = parseClientMessage(rawStr);
      if (!msg) {
        return;
      }

      // If player has not yet completed hello
      if (!playerSession) {
        if (msg.t === 'hello') {
          if (helloTimer) {
            clearTimeout(helloTimer);
            helloTimer = null;
          }

          if (players.size >= config.maxPlayers) {
            const fullMsg: ServerFullMsg = { t: 'full' };
            ws.send(JSON.stringify(fullMsg));
            ws.close(4001, 'Lobby full');
            return;
          }

          const playerId = crypto.randomUUID();
          const existingNames = new Set<string>();
          for (const p of players.values()) {
            if (p.name) existingNames.add(p.name);
          }
          const name = generateLobbyName(existingNames);
          playerSession = {
            id: playerId,
            name,
            outfit: msg.outfit,
            ws,
            state: null,
            lastEmoteTime: 0,
          };
          players.set(playerId, playerSession);

          const welcome: ServerWelcomeMsg = {
            t: 'welcome',
            id: playerId,
            name,
            players: getActivePlayersState(),
          };
          ws.send(JSON.stringify(welcome));
        }
        return;
      }

      // If player is already welcomed
      if (msg.t === 'state') {
        const clamped = clampToWorld(msg.x, msg.y);
        const updatedState: PlayerNetState = {
          id: playerSession.id,
          name: playerSession.name,
          x: clamped.x,
          y: clamped.y,
          zone: msg.zone,
          facing: msg.facing,
          action: msg.action,
          outfit: playerSession.outfit,
          pomo: msg.pomo,
        };
        playerSession.state = updatedState;
        dirtyPlayers.set(playerSession.id, updatedState);
        return;
      }

      if (msg.t === 'emote') {
        const now = Date.now();
        if (now - playerSession.lastEmoteTime >= 1000) {
          playerSession.lastEmoteTime = now;
          const emoteMsg: ServerEmoteMsg = {
            t: 'emote',
            id: playerSession.id,
            e: msg.e,
          };
          const payload = JSON.stringify(emoteMsg);
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          }
        }
        return;
      }
    });

    ws.on('close', () => {
      if (helloTimer) {
        clearTimeout(helloTimer);
        helloTimer = null;
      }

      if (playerSession) {
        players.delete(playerSession.id);
        dirtyPlayers.delete(playerSession.id);
        leftPlayerIds.add(playerSession.id);
      }

      socketLastPong.delete(ws);

      const set = ipConnections.get(clientIp);
      if (set) {
        set.delete(ws);
        if (set.size === 0) ipConnections.delete(clientIp);
      }
    });
  });

  // Broadcast loop: every 100 ms (10 Hz), send snap to all sockets if anything changed
  const broadcastTimer = setInterval(() => {
    if (dirtyPlayers.size > 0 || leftPlayerIds.size > 0) {
      const snap: ServerSnapMsg = {
        t: 'snap',
        players: Array.from(dirtyPlayers.values()),
        left: Array.from(leftPlayerIds),
      };
      const payload = JSON.stringify(snap);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
      dirtyPlayers.clear();
      leftPlayerIds.clear();
    }
  }, config.broadcastIntervalMs);

  // Heartbeat loop: ping every 25 s; terminate after 60 s without a pong
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const client of wss.clients) {
      const lastPong = socketLastPong.get(client) ?? now;
      if (now - lastPong > config.pongTimeoutMs) {
        client.terminate();
      } else {
        client.ping();
      }
    }
  }, config.pingIntervalMs);

  const cleanup = () => {
    clearInterval(broadcastTimer);
    clearInterval(heartbeatTimer);
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {}
    }
  };

  return {
    server,
    wss,
    config,
    cleanup,
  };
}

export function startServer(
  port = Number(process.env.PORT) || 8080,
  host = '0.0.0.0',
  options?: Partial<ServerConfig>
): Promise<ServerInstance> {
  const mergedOptions: Partial<ServerConfig> = {
    ...options,
    port,
    host,
  };
  const { server, wss, config, cleanup } = createServer(mergedOptions);

  const sigtermHandler = () => {
    for (const client of wss.clients) {
      try {
        client.close(1001, 'Going Away');
      } catch {}
    }
    cleanup();
    wss.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', sigtermHandler);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        wss,
        port: actualPort,
        config,
        close: () =>
          new Promise<void>((resClose, rejClose) => {
            process.off('SIGTERM', sigtermHandler);
            cleanup();
            wss.close(() => {
              server.close((err) => (err ? rejClose(err) : resClose()));
            });
          }),
      });
    });
  });
}
