import type {
  EmoteId,
  Facing,
  Outfit,
  PlayerAction,
  PlayerNetState,
  PomoBadge,
  ZoneId,
} from '@lofi/shared';
import { NET_HEARTBEAT_MS, NET_SEND_HZ } from '@lofi/shared';
import type { Container } from 'pixi.js';
import type { TransportAdapter } from './TransportAdapter';
import type { LocalPlayer } from '../entities/LocalPlayer';
import { RemotePlayer } from '../entities/RemotePlayer';
import { gameEvents, type GameEvents } from '../engine/events';
import { pomodoroController, type PomodoroController } from '../systems/PomodoroController';
import { StorageManager } from '../systems/StorageManager';
import type { WorldLayers } from '../engine/layers';

export interface NetSyncOptions {
  localPlayer?: LocalPlayer;
  getLocalState?: () => {
    x: number;
    y: number;
    zone: ZoneId;
    facing: Facing;
    action: PlayerAction;
  };
  getName?: () => string;
  getOutfit?: () => Outfit;
  getPomo?: () => PomoBadge;
  remotePlayers?: Map<string, RemotePlayer>;
  worldUiLayer?: Container;
  entityLayer?: Container;
  layers?: WorldLayers;
  events?: GameEvents;
  pomodoro?: PomodoroController;
  clock?: () => number;
  autoStart?: boolean;
}

function hasStateChanged(
  a: Omit<PlayerNetState, 'id'> | null,
  b: Omit<PlayerNetState, 'id'>
): boolean {
  if (!a) return true;
  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.zone !== b.zone ||
    a.facing !== b.facing ||
    a.action !== b.action ||
    a.name !== b.name ||
    a.pomo !== b.pomo ||
    a.outfit.baseId !== b.outfit.baseId ||
    a.outfit.hatId !== b.outfit.hatId ||
    a.outfit.colorHex !== b.outfit.colorHex
  );
}

export class NetSync {
  public readonly transport: TransportAdapter;
  public readonly remotePlayers: Map<string, RemotePlayer>;
  private localPlayer?: LocalPlayer;
  private getLocalStateFn?: () => {
    x: number;
    y: number;
    zone: ZoneId;
    facing: Facing;
    action: PlayerAction;
  };
  private getNameFn?: () => string;
  private getOutfitFn?: () => Outfit;
  private getPomoFn?: () => PomoBadge;
  private worldUiLayer?: Container;
  private entityLayer?: Container;
  private events: GameEvents;
  private pomodoro: PomodoroController;
  private clock: () => number;

  private intervalId: any = null;
  private lastSentState: Omit<PlayerNetState, 'id'> | null = null;
  private lastSentTime: number = -Infinity;
  private unsubs: Array<() => void> = [];

  constructor(
    transport: TransportAdapter,
    localPlayerOrOptions?: LocalPlayer | NetSyncOptions,
    maybeOptions?: NetSyncOptions
  ) {
    this.transport = transport;

    let opts: NetSyncOptions = {};
    if (
      localPlayerOrOptions &&
      'getLocalState' in localPlayerOrOptions &&
      typeof (localPlayerOrOptions as any).getLocalState === 'function' &&
      'x' in (localPlayerOrOptions as any)
    ) {
      this.localPlayer = localPlayerOrOptions as LocalPlayer;
      opts = maybeOptions ?? {};
    } else if (localPlayerOrOptions) {
      opts = localPlayerOrOptions as NetSyncOptions;
      this.localPlayer = opts.localPlayer;
    }

    this.getLocalStateFn = opts.getLocalState;
    this.getNameFn = opts.getName;
    this.getOutfitFn = opts.getOutfit;
    this.getPomoFn = opts.getPomo;
    this.remotePlayers = opts.remotePlayers ?? new Map();
    this.worldUiLayer = opts.worldUiLayer ?? opts.layers?.worldUiLayer;
    this.entityLayer = opts.entityLayer ?? opts.layers?.entityLayer;
    this.events = opts.events ?? gameEvents;
    this.pomodoro = opts.pomodoro ?? pomodoroController;
    this.clock = opts.clock ?? (() => Date.now());

    // Forward GameEvents.localEmote to transport.sendEmote
    const unsubEmote = this.events.on('localEmote', ({ emote }) => {
      this.transport.sendEmote(emote);
    });
    this.unsubs.push(unsubEmote);

    // Incoming emotes call showEmote on the remote avatar
    const unsubRemoteEmote = this.transport.onEmote((playerId, emote) => {
      const rp = this.remotePlayers.get(playerId);
      if (rp) {
        rp.showEmote(emote);
      }
    });
    this.unsubs.push(unsubRemoteEmote);

    // Incoming players change
    const unsubPlayers = this.transport.onPlayersChange((players) => {
      this.handlePlayersChange(players);
    });
    this.unsubs.push(unsubPlayers);

    // Incoming status change -> emit connectionStatusChanged
    const unsubStatus = this.transport.onStatusChange((status) => {
      this.events.emit('connectionStatusChanged', { status });
    });
    this.unsubs.push(unsubStatus);

    if (opts.autoStart !== false) {
      this.start();
    }
  }

  public start(): void {
    if (this.intervalId) return;

    // Send initial state immediately
    this.tick();

    // Start setInterval at 1000 / NET_SEND_HZ (NOT the Pixi ticker)
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000 / NET_SEND_HZ);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getCurrentState(): Omit<PlayerNetState, 'id'> {
    let base: {
      x: number;
      y: number;
      zone: ZoneId;
      facing: Facing;
      action: PlayerAction;
    };

    if (this.getLocalStateFn) {
      base = this.getLocalStateFn();
    } else if (this.localPlayer) {
      base = this.localPlayer.getLocalState();
    } else {
      base = { x: 0, y: 0, zone: 'forest', facing: 'down', action: 'idle' };
    }

    const name = this.getNameFn
      ? this.getNameFn()
      : this.localPlayer?.assignedName ?? this.localPlayer?.avatar?.playerName ?? StorageManager.get().profile.name;

    const outfit = this.getOutfitFn
      ? this.getOutfitFn()
      : this.localPlayer?.avatar?.outfit ?? StorageManager.get().profile.outfit;

    const pomo = this.getPomoFn
      ? this.getPomoFn()
      : this.pomodoro.localBadge();

    return {
      ...base,
      name,
      outfit,
      pomo,
    };
  }

  public tick(): void {
    const now = this.clock();
    const currentState = this.getCurrentState();

    const changed = hasStateChanged(this.lastSentState, currentState);
    const timeSinceLast = now - this.lastSentTime;

    if (changed || timeSinceLast >= NET_HEARTBEAT_MS) {
      this.transport.sendLocalState(currentState);
      this.lastSentState = {
        ...currentState,
        outfit: { ...currentState.outfit },
      };
      this.lastSentTime = now;
    }
  }

  public handlePlayersChange(players: Map<string, PlayerNetState>): void {
    const now = this.clock();

    // Remove any RemotePlayers missing from the new players map
    for (const [id, rp] of Array.from(this.remotePlayers.entries())) {
      if (!players.has(id)) {
        rp.destroy();
        this.remotePlayers.delete(id);
      }
    }

    // Add or update RemotePlayers
    for (const [id, state] of players.entries()) {
      const existing = this.remotePlayers.get(id);
      if (existing) {
        existing.updateState(state, now);
      } else {
        const rp = new RemotePlayer(state);
        if (this.worldUiLayer) {
          rp.worldUiLayer = this.worldUiLayer;
        }
        if (this.entityLayer) {
          this.entityLayer.addChild(rp);
        }
        this.remotePlayers.set(id, rp);
      }
    }

    this.events.emit('playersChanged', { players });
  }

  public update(dt: number, now: number = this.clock()): void {
    for (const rp of this.remotePlayers.values()) {
      rp.update(dt, now);
    }
  }

  public destroy(): void {
    this.stop();
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    for (const rp of this.remotePlayers.values()) {
      rp.destroy();
    }
    this.remotePlayers.clear();
  }
}
