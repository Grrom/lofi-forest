import {
  P2P_MAX_PEERS,
  validateEmote,
  validateP2PPlayer,
  type EmoteId,
  type PlayerNetState,
} from '@lofi/shared';
import { joinRoom as defaultJoinRoom } from 'trystero';
import type { TransportAdapter, TransportMode, TransportStatus } from './TransportAdapter';

export type TrysteroJoinRoomFn = (config: any, roomCode: string) => any;

export interface TrysteroTransportOptions {
  password?: string;
  joinRoomFn?: TrysteroJoinRoomFn;
  clock?: () => number;
  appId?: string;
  rtcConfig?: RTCConfiguration;
  turnUrl?: string;
  iceServersJson?: string;
}

export class TrysteroTransport implements TransportAdapter {
  public readonly mode: TransportMode = 'p2p';

  private roomCode: string;
  private password?: string;
  private joinRoomFn: TrysteroJoinRoomFn;
  private clock: () => number;
  private appId?: string;
  private explicitRtcConfig?: RTCConfiguration;
  private turnUrl?: string;
  private iceServersJson?: string;

  private status: TransportStatus = 'connecting';
  private room: any = null;
  private players = new Map<string, PlayerNetState>();
  private peerLastSeen = new Map<string, number>();
  private peerMessageTimestamps = new Map<string, number[]>();

  private latestLocalState: Omit<PlayerNetState, 'id'> | null = null;
  private sendPlayerFn: ((data: any, targetPeerId?: string) => void) | null = null;
  private sendEmoteFn: ((data: any, targetPeerId?: string) => void) | null = null;

  private statusListeners = new Set<(status: TransportStatus) => void>();
  private playersListeners = new Set<(players: Map<string, PlayerNetState>) => void>();
  private emoteListeners = new Set<(playerId: string, e: EmoteId) => void>();

  private joinCapTimer: any = null;
  private cleanupInterval: any = null;

  private connectPromise: Promise<void> | null = null;
  private turnAbortController: AbortController | null = null;
  private isDisposed = false;
  private connectGeneration = 0;

  constructor(roomCode: string, options?: TrysteroTransportOptions) {
    this.roomCode = roomCode;
    this.password = options?.password;
    this.joinRoomFn = options?.joinRoomFn ?? (defaultJoinRoom as unknown as TrysteroJoinRoomFn);
    this.clock = options?.clock ?? (() => Date.now());
    this.appId = options?.appId;
    this.explicitRtcConfig = options?.rtcConfig;
    this.turnUrl = options?.turnUrl;
    this.iceServersJson = options?.iceServersJson;
  }

  public connect(): Promise<void> {
    if (this.room) return Promise.resolve();
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const currentGen = ++this.connectGeneration;
    this.isDisposed = false;
    this.setStatus('connecting');

    const inFlightPromise = (async () => {
      const appId =
        this.appId ??
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TRYSTERO_APP_ID
          ? String(import.meta.env.VITE_TRYSTERO_APP_ID)
          : typeof process !== 'undefined' && process.env?.VITE_TRYSTERO_APP_ID
            ? String(process.env.VITE_TRYSTERO_APP_ID)
            : 'lofi-forest');

      const turnUrl =
        this.turnUrl ??
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURN_URL
          ? String(import.meta.env.VITE_TURN_URL)
          : typeof process !== 'undefined' && process.env?.VITE_TURN_URL
            ? String(process.env.VITE_TURN_URL)
            : undefined);

      const iceServersJson =
        this.iceServersJson ??
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ICE_SERVERS_JSON
          ? String(import.meta.env.VITE_ICE_SERVERS_JSON)
          : typeof process !== 'undefined' && process.env?.VITE_ICE_SERVERS_JSON
            ? String(process.env.VITE_ICE_SERVERS_JSON)
            : undefined);

      let iceServers: RTCIceServer[] | undefined;

      if (turnUrl && turnUrl.trim().length > 0) {
        try {
          const controller = new AbortController();
          this.turnAbortController = controller;
          let timeoutHandle: any;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              controller.abort();
              reject(new Error('TURN fetch timeout'));
            }, 3000);
          });

          const fetchPromise = (async () => {
            const res = await fetch(turnUrl.trim(), { signal: controller.signal });
            if (!res.ok) {
              throw new Error(`TURN fetch failed with status ${res.status}`);
            }
            const data = (await res.json()) as { iceServers?: RTCIceServer[] };
            if (!data || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
              throw new Error('TURN fetch returned invalid or empty iceServers');
            }
            return data.iceServers;
          })();

          try {
            iceServers = await Promise.race([fetchPromise, timeoutPromise]);
          } finally {
            clearTimeout(timeoutHandle);
            fetchPromise.catch(() => {});
            if (this.turnAbortController === controller) {
              this.turnAbortController = null;
            }
          }
        } catch (err) {
          if (this.isDisposed || this.connectGeneration !== currentGen) {
            this.setStatus('disconnected');
            return;
          }
          console.warn('[TrysteroTransport] Failed to fetch TURN credentials, falling back:', err);
        }
      }

      if (this.isDisposed || this.connectGeneration !== currentGen) {
        this.setStatus('disconnected');
        return;
      }

      if (!iceServers && iceServersJson && iceServersJson.trim().length > 0) {
        try {
          iceServers = JSON.parse(iceServersJson.trim());
        } catch (err) {
          console.warn('[TrysteroTransport] Failed to parse VITE_ICE_SERVERS_JSON:', err);
        }
      }

      if (this.isDisposed || this.connectGeneration !== currentGen) {
        this.setStatus('disconnected');
        return;
      }

      const rtcConfig: RTCConfiguration = {
        ...this.explicitRtcConfig,
        ...(iceServers ? { iceServers } : {}),
      };

      const config: { appId: string; password?: string; rtcConfig?: RTCConfiguration } = {
        appId,
        rtcConfig,
      };
      if (this.password) {
        config.password = this.password;
      }

      if (this.isDisposed || this.connectGeneration !== currentGen) {
        this.setStatus('disconnected');
        return;
      }

      try {
        this.room = this.joinRoomFn(config, this.roomCode);
      } catch (err) {
        console.error('[TrysteroTransport] joinRoom failed:', err);
        this.setStatus('disconnected');
        return;
      }

      if (this.isDisposed || this.connectGeneration !== currentGen) {
        if (this.room) {
          try {
            if (typeof this.room.leave === 'function') {
              this.room.leave();
            } else if (typeof this.room.leaveRoom === 'function') {
              this.room.leaveRoom();
            }
          } catch {}
          this.room = null;
        }
        this.setStatus('disconnected');
        return;
      }

    const bindAction = (
      actionName: string,
      onData: (data: unknown, peerId: string) => void
    ): ((data: any, targetPeerId?: string) => void) | null => {
      if (!this.room || typeof this.room.makeAction !== 'function') return null;
      const actionResult = this.room.makeAction(actionName);

      if (Array.isArray(actionResult)) {
        const [sendFn, onReceiveFn] = actionResult;
        if (typeof onReceiveFn === 'function') {
          onReceiveFn((data: unknown, peerIdOrContext: unknown) => {
            const peerId =
              typeof peerIdOrContext === 'object' &&
              peerIdOrContext !== null &&
              'peerId' in peerIdOrContext
                ? String((peerIdOrContext as any).peerId)
                : String(peerIdOrContext);
            onData(data, peerId);
          });
        }
        return (data: any, targetPeerId?: string) => {
          if (targetPeerId !== undefined) {
            sendFn(data, targetPeerId);
          } else {
            sendFn(data);
          }
        };
      } else if (actionResult && typeof actionResult === 'object') {
        if ('onMessage' in actionResult && typeof actionResult.onMessage === 'function') {
          actionResult.onMessage((data: unknown, context: any) => {
            const peerId =
              typeof context === 'object' && context !== null && 'peerId' in context
                ? String(context.peerId)
                : String(context);
            onData(data, peerId);
          });
        }
        return (data: any, targetPeerId?: string) => {
          if (typeof actionResult.send === 'function') {
            actionResult.send(data, targetPeerId ? { target: targetPeerId } : undefined);
          }
        };
      }
      return null;
    };

    this.sendPlayerFn = bindAction('player', (data, peerId) => {
      if (!this.checkRateLimit(peerId)) {
        return;
      }
      const validated = validateP2PPlayer(data);
      if (!validated) {
        return;
      }
      const now = this.clock();
      this.peerLastSeen.set(peerId, now);
      this.players.set(peerId, {
        id: peerId,
        ...validated,
      });
      this.notifyPlayers();
    });

    this.sendEmoteFn = bindAction('emote', (data, peerId) => {
      if (!this.checkRateLimit(peerId)) {
        return;
      }
      const validated = validateEmote(data);
      if (!validated) {
        return;
      }
      const now = this.clock();
      this.peerLastSeen.set(peerId, now);
      this.notifyEmote(peerId, validated.e);
    });

    if (this.room && typeof this.room.onPeerJoin === 'function') {
      this.room.onPeerJoin((contextOrPeerId: any) => {
        const peerId =
          typeof contextOrPeerId === 'object' &&
          contextOrPeerId !== null &&
          'peerId' in contextOrPeerId
            ? String(contextOrPeerId.peerId)
            : String(contextOrPeerId);
        // Broadcast via NetSync, and sent directly to each newly joined peer
        if (this.latestLocalState && this.sendPlayerFn) {
          this.sendPlayerFn(this.latestLocalState, peerId);
        }
      });
    }

    if (this.room && typeof this.room.onPeerLeave === 'function') {
      this.room.onPeerLeave((contextOrPeerId: any) => {
        const peerId =
          typeof contextOrPeerId === 'object' &&
          contextOrPeerId !== null &&
          'peerId' in contextOrPeerId
            ? String(contextOrPeerId.peerId)
            : String(contextOrPeerId);
        // after onPeerLeave(A), A is removed
        if (this.players.has(peerId)) {
          this.players.delete(peerId);
          this.peerLastSeen.delete(peerId);
          this.peerMessageTimestamps.delete(peerId);
          this.notifyPlayers();
        }
      });
    }

    this.setStatus('connected');

    // Cap check: 2 s after joining, if getPeers() returns >= P2P_MAX_PEERS - 1 peers, leave and report room_full
    this.joinCapTimer = setTimeout(() => {
      if (this.status !== 'connected' || !this.room) return;
      const peers = typeof this.room.getPeers === 'function' ? this.room.getPeers() : {};
      const peerCount = Array.isArray(peers)
        ? peers.length
        : typeof peers === 'object' && peers !== null
          ? Object.keys(peers).length
          : 0;

      if (peerCount >= P2P_MAX_PEERS - 1) {
        this.setStatus('room_full');
        this.leaveAndCleanup(false);
      }
    }, 2000);

    // Heartbeat check for inactive peers: peer that sends nothing for 10 s is removed
    this.cleanupInterval = setInterval(() => {
      const now = this.clock();
      let changed = false;
      for (const [peerId, lastSeen] of Array.from(this.peerLastSeen.entries())) {
        if (now - lastSeen >= 10000) {
          this.players.delete(peerId);
          this.peerLastSeen.delete(peerId);
          this.peerMessageTimestamps.delete(peerId);
          changed = true;
        }
      }
      if (changed) {
        this.notifyPlayers();
      }
    }, 1000);
    })().finally(() => {
      if (this.connectPromise === inFlightPromise) {
        this.connectPromise = null;
      }
    });

    this.connectPromise = inFlightPromise;
    return this.connectPromise;
  }

  public disconnect(): void {
    this.leaveAndCleanup(true);
  }

  private leaveAndCleanup(setDisconnected: boolean): void {
    this.isDisposed = true;
    this.connectGeneration++;
    this.connectPromise = null;

    if (this.turnAbortController) {
      try {
        this.turnAbortController.abort();
      } catch {}
      this.turnAbortController = null;
    }

    if (this.joinCapTimer) {
      clearTimeout(this.joinCapTimer);
      this.joinCapTimer = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.room) {
      try {
        if (typeof this.room.leave === 'function') {
          this.room.leave();
        } else if (typeof this.room.leaveRoom === 'function') {
          this.room.leaveRoom();
        }
      } catch (err) {
        // ignore
      }
      this.room = null;
    }

    this.sendPlayerFn = null;
    this.sendEmoteFn = null;
    this.players.clear();
    this.peerLastSeen.clear();
    this.peerMessageTimestamps.clear();
    this.notifyPlayers();

    if (setDisconnected) {
      this.setStatus('disconnected');
    }
  }

  public sendLocalState(state: Omit<PlayerNetState, 'id'>): void {
    this.latestLocalState = state;
    if (this.sendPlayerFn && this.status === 'connected') {
      this.sendPlayerFn(state);
    }
  }

  public sendEmote(e: EmoteId): void {
    if (this.sendEmoteFn && this.status === 'connected') {
      this.sendEmoteFn({ e });
    }
  }

  public onPlayersChange(cb: (players: Map<string, PlayerNetState>) => void): () => void {
    this.playersListeners.add(cb);
    cb(new Map(this.players));
    return () => {
      this.playersListeners.delete(cb);
    };
  }

  public onEmote(cb: (playerId: string, e: EmoteId) => void): () => void {
    this.emoteListeners.add(cb);
    return () => {
      this.emoteListeners.delete(cb);
    };
  }

  public onStatusChange(cb: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(status: TransportStatus): void {
    this.status = status;
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  private notifyPlayers(): void {
    const copy = new Map(this.players);
    for (const cb of this.playersListeners) {
      cb(copy);
    }
  }

  private notifyEmote(playerId: string, emote: EmoteId): void {
    for (const cb of this.emoteListeners) {
      cb(playerId, emote);
    }
  }

  /**
   * Rate limit: more than 15 messages/s from one peer are dropped.
   * Uses a sliding 1-second window.
   */
  private checkRateLimit(peerId: string): boolean {
    const now = this.clock();
    let timestamps = this.peerMessageTimestamps.get(peerId);
    if (!timestamps) {
      timestamps = [];
      this.peerMessageTimestamps.set(peerId, timestamps);
    }

    const windowStart = now - 1000;
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= 15) {
      this.peerMessageTimestamps.set(peerId, timestamps);
      return false; // drop message
    }

    timestamps.push(now);
    this.peerMessageTimestamps.set(peerId, timestamps);
    return true;
  }
}
