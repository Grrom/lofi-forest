import type {
  ClientEmoteMsg,
  ClientHelloMsg,
  ClientStateMsg,
  EmoteId,
  Outfit,
  PlayerNetState,
} from '@lofi/shared';
import { parseServerMessage } from '@lofi/shared';
import type {
  TransportAdapter,
  TransportMode,
  TransportStatus,
} from './TransportAdapter.js';
import { gameEvents } from '../engine/events.js';
import { StorageManager } from '../systems/StorageManager.js';

export interface WebSocketTransportOptions {
  url?: string;
  spectator?: boolean;
  name?: string;
  outfit?: Outfit;
  getName?: () => string;
  getOutfit?: () => Outfit;
  pageProtocol?: string;
  webSocketFactory?: (url: string) => any;
  random?: () => number;
}

export class WebSocketTransport implements TransportAdapter {
  public readonly mode: TransportMode = 'public';
  public readonly spectator: boolean;
  public status: TransportStatus = 'disconnected';
  public errorMessage: string | null = null;
  public myId: string | null = null;

  private options: WebSocketTransportOptions;
  private ws: any = null;
  private players: Map<string, PlayerNetState> = new Map();
  private playersListeners = new Set<(players: Map<string, PlayerNetState>) => void>();
  private emoteListeners = new Set<(playerId: string, e: EmoteId) => void>();
  private statusListeners = new Set<(status: TransportStatus) => void>();

  private retryCount = 0;
  private retryTimer: any = null;
  private intentionalClose = false;
  private cachedName?: string;
  private cachedOutfit?: Outfit;
  private random: () => number;

  constructor(options: WebSocketTransportOptions = {}) {
    this.options = options;
    this.spectator =
      options.spectator ??
      (typeof window !== 'undefined' && window.location
        ? new URLSearchParams(window.location.search).get('spectator') === '1'
        : false);
    this.random = options.random ?? Math.random;
    if (options.name) this.cachedName = options.name;
    if (options.outfit) this.cachedOutfit = options.outfit;
  }

  public getWsUrl(): string {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    const envUrl = metaEnv?.VITE_PUBLIC_WS_URL as string | undefined;
    const rawUrl = this.options.url ?? envUrl ?? 'ws://localhost:8080/ws';

    if (this.spectator) {
      try {
        const parsed = new URL(rawUrl);
        parsed.searchParams.set('spectator', '1');
        return parsed.toString();
      } catch {
        const sep = rawUrl.includes('?') ? '&' : '?';
        return `${rawUrl}${sep}spectator=1`;
      }
    }

    return rawUrl;
  }

  public async connect(): Promise<void> {
    this.intentionalClose = false;
    this.clearRetryTimer();
    this.retryCount = 0;
    return this.attemptConnect();
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.clearRetryTimer();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal Closure');
      } catch {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public sendLocalState(state: Omit<PlayerNetState, 'id'>): void {
    if (this.spectator) return;
    this.cachedName = state.name;
    this.cachedOutfit = state.outfit;

    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === this.ws.OPEN)) {
      const msg: ClientStateMsg = {
        t: 'state',
        x: state.x,
        y: state.y,
        zone: state.zone,
        facing: state.facing,
        action: state.action,
        pomo: state.pomo,
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  public sendEmote(e: EmoteId): void {
    if (this.spectator) return;
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === this.ws.OPEN)) {
      const msg: ClientEmoteMsg = {
        t: 'emote',
        e,
      };
      this.ws.send(JSON.stringify(msg));
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

  public getPlayers(): Map<string, PlayerNetState> {
    return new Map(this.players);
  }

  private setStatus(status: TransportStatus): void {
    if (this.status === status && status !== 'reconnecting') return;
    this.status = status;
    for (const cb of Array.from(this.statusListeners)) {
      cb(status);
    }
    gameEvents.emit('connectionStatusChanged', { status });
  }

  private notifyPlayers(): void {
    const mapCopy = new Map(this.players);
    for (const cb of Array.from(this.playersListeners)) {
      cb(mapCopy);
    }
  }

  private notifyEmote(playerId: string, e: EmoteId): void {
    for (const cb of Array.from(this.emoteListeners)) {
      cb(playerId, e);
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private getName(): string {
    if (this.cachedName) return this.cachedName;
    if (this.options.name) return this.options.name;
    if (this.options.getName) return this.options.getName();
    try {
      const profileName = StorageManager.get()?.profile?.name;
      if (profileName) return profileName;
    } catch {}
    return 'Wanderer';
  }

  private getOutfit(): Outfit {
    if (this.cachedOutfit) return this.cachedOutfit;
    if (this.options.outfit) return this.options.outfit;
    if (this.options.getOutfit) return this.options.getOutfit();
    try {
      const profileOutfit = StorageManager.get()?.profile?.outfit;
      if (profileOutfit) return profileOutfit;
    } catch {}
    return {
      baseId: 'default',
      hatId: 'none',
      colorHex: '#4a7c59',
    };
  }

  private sendHello(): void {
    if (this.spectator) return;
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === this.ws.OPEN)) {
      const msg: ClientHelloMsg = {
        t: 'hello',
        name: this.getName(),
        outfit: this.getOutfit(),
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleRoomFull(): void {
    this.clearRetryTimer();
    this.setStatus('room_full');
    if (this.ws) {
      this.intentionalClose = true;
      try {
        this.ws.close(4001, 'Lobby full');
      } catch {}
      this.ws = null;
    }
  }

  private handleRateLimited(): void {
    this.clearRetryTimer();
    this.setStatus('reconnecting');
    const delay = 30000;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attemptConnect();
    }, delay);
  }

  private handleUnexpectedClose(): void {
    this.clearRetryTimer();
    this.setStatus('reconnecting');

    const base = Math.min(30000, 1000 * Math.pow(2, this.retryCount));
    this.retryCount++;

    const jitterFactor = 0.8 + this.random() * 0.4;
    const delay = Math.round(base * jitterFactor);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attemptConnect();
    }, delay);
  }

  private handleMessage(data: any): void {
    const rawStr = typeof data === 'string' ? data : data?.toString?.() ?? '';
    const msg = parseServerMessage(rawStr);
    if (!msg) {
      return;
    }

    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.id;
        this.players.clear();
        for (const p of msg.players) {
          if (p.id !== this.myId) {
            this.players.set(p.id, p);
          }
        }
        this.notifyPlayers();
        break;
      }
      case 'snap': {
        for (const p of msg.players) {
          if (p.id !== this.myId) {
            this.players.set(p.id, p);
          }
        }
        for (const leftId of msg.left) {
          this.players.delete(leftId);
        }
        this.notifyPlayers();
        break;
      }
      case 'emote': {
        if (msg.id !== this.myId) {
          this.notifyEmote(msg.id, msg.e);
        }
        break;
      }
      case 'full': {
        this.handleRoomFull();
        break;
      }
    }
  }

  private createWebSocket(url: string): any {
    if (this.options.webSocketFactory) {
      return this.options.webSocketFactory(url);
    }
    const WS =
      typeof WebSocket !== 'undefined'
        ? WebSocket
        : typeof window !== 'undefined' && (window as any).WebSocket
          ? (window as any).WebSocket
          : (globalThis as any).WebSocket;
    if (!WS) {
      throw new Error('WebSocket is not supported in this environment');
    }
    return new WS(url);
  }

  private attemptConnect(): Promise<void> {
    const url = this.getWsUrl();

    // Mixed content check:
    const pageProtocol =
      this.options.pageProtocol ??
      (typeof window !== 'undefined' && window.location?.protocol
        ? window.location.protocol
        : '');

    if (pageProtocol === 'https:' && url.startsWith('ws://')) {
      this.setStatus('disconnected');
      const msg = 'Public lobby needs a wss:// URL';
      this.errorMessage = msg;
      gameEvents.emit('toast', { message: msg });
      return Promise.resolve();
    }

    this.setStatus(this.status === 'reconnecting' ? 'reconnecting' : 'connecting');

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    try {
      const ws = this.createWebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.retryCount = 0;
        this.setStatus('connected');
        if (!this.spectator) {
          this.sendHello();
        }
      };

      ws.onmessage = (event: any) => {
        if (this.ws !== ws) return;
        this.handleMessage(event.data);
      };

      ws.onclose = (event: any) => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.intentionalClose) {
          return;
        }
        if (event?.code === 4001) {
          this.handleRoomFull();
          return;
        }
        if (event?.code === 4008) {
          this.handleRateLimited();
          return;
        }
        this.handleUnexpectedClose();
      };

      ws.onerror = () => {
        // ws.onclose handles error recovery
      };
    } catch {
      this.handleUnexpectedClose();
    }

    return Promise.resolve();
  }
}


