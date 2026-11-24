import { AFK_MS, type PlayerAction } from '@lofi/shared';
import { gameEvents, type GameEvents } from '../engine/events';

export type SuppressedFn = () => boolean;

export interface AfkDetectorOptions {
  afkMs?: number;
  isSuppressed?: SuppressedFn;
  player?: { action: PlayerAction };
  onSleep?: () => void;
  onWake?: () => void;
  gameEvents?: GameEvents;
  checkIntervalMs?: number;
}

/**
 * AfkDetector monitors player inactivity.
 * After AFK_MS (default 300 000 ms) without localInput, sets action to 'sleep'.
 * Any localInput wakes the player and resets action to 'idle'.
 * If isSuppressed() returns true, sleep is prevented (e.g. during Pomodoro focus).
 */
export class AfkDetector {
  public action: PlayerAction = 'idle';
  public isSleeping: boolean = false;
  public lastInputTime: number;

  private afkMs: number = AFK_MS;
  private isSuppressedFn: SuppressedFn = () => false;
  private player?: { action: PlayerAction };
  private onSleepCb?: () => void;
  private onWakeCb?: () => void;
  private events: GameEvents = gameEvents;
  private timerId: any = null;
  private unsubInput?: () => void;

  constructor(
    targetOrOptions?: { action: PlayerAction } | AfkDetectorOptions,
    isSuppressed?: SuppressedFn
  ) {
    this.lastInputTime = Date.now();
    let checkInterval = 1000;

    if (targetOrOptions && 'action' in targetOrOptions) {
      this.player = targetOrOptions as { action: PlayerAction };
      this.action = this.player.action;
      if (isSuppressed) {
        this.isSuppressedFn = isSuppressed;
      }
    } else if (targetOrOptions) {
      const opts = targetOrOptions as AfkDetectorOptions;
      if (opts.afkMs !== undefined) this.afkMs = opts.afkMs;
      if (opts.isSuppressed !== undefined) this.isSuppressedFn = opts.isSuppressed;
      if (opts.player !== undefined) {
        this.player = opts.player;
        this.action = opts.player.action;
      }
      if (opts.onSleep !== undefined) this.onSleepCb = opts.onSleep;
      if (opts.onWake !== undefined) this.onWakeCb = opts.onWake;
      if (opts.gameEvents !== undefined) this.events = opts.gameEvents;
      if (opts.checkIntervalMs !== undefined) checkInterval = opts.checkIntervalMs;
    }

    this.timerId = setInterval(() => {
      this.check();
    }, checkInterval);

    this.unsubInput = this.events.on('localInput', () => {
      this.handleInput();
    });
  }

  public isSuppressed(): boolean {
    return this.isSuppressedFn();
  }

  public setSuppressed(fn: SuppressedFn): void {
    this.isSuppressedFn = fn;
  }

  public check(now: number = Date.now()): void {
    if (this.isSleeping) return;
    if (now - this.lastInputTime >= this.afkMs) {
      if (this.isSuppressed()) {
        return;
      }
      this.goToSleep();
    }
  }

  public handleInput(): void {
    if (this.isSleeping) {
      this.wakeUp();
    } else {
      this.lastInputTime = Date.now();
    }
  }

  public goToSleep(): void {
    this.isSleeping = true;
    this.action = 'sleep';
    if (this.player) {
      this.player.action = 'sleep';
    }
    this.onSleepCb?.();
  }

  public wakeUp(): void {
    this.isSleeping = false;
    this.action = 'idle';
    if (this.player) {
      this.player.action = 'idle';
    }
    this.lastInputTime = Date.now();
    this.onWakeCb?.();
  }

  public destroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.unsubInput) {
      this.unsubInput();
      this.unsubInput = undefined;
    }
  }
}
