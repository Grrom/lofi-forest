import type { PomoBadge } from '@lofi/shared';
import {
  StorageManager,
  defaultStorageManager,
  type PomoPreset,
  type StoragePrefs,
} from './StorageManager';
import { gameEvents, type GameEvents } from '../engine/events';
import { audioEngine, type ChimeHandle } from '../audio/AudioEngine';

export type PomodoroPhase = 'idle' | 'focus' | 'break';

export interface PomodoroState {
  phase: PomodoroPhase;
  endsAtMs: number | null;
  pausedRemainingMs: number | null;
  focusMin: number;
  breakMin: number;
  preset: PomoPreset;
}

export interface PomodoroTransition {
  from: PomodoroPhase;
  to: PomodoroPhase;
}

export interface PomodoroTickResult {
  transitioned: boolean;
  from: PomodoroPhase;
  to: PomodoroPhase;
  transitions: PomodoroTransition[];
}

export interface ChimeScheduler {
  scheduleChime(endsAtMs: number): ChimeHandle | any;
  cancelChime(handle: any): void;
}

export interface PomodoroControllerOptions {
  now?: () => number;
  focusMin?: number;
  breakMin?: number;
  preset?: PomoPreset;
  phase?: PomodoroPhase;
  endsAtMs?: number | null;
  pausedRemainingMs?: number | null;
  audio?: ChimeScheduler;
  gameEvents?: GameEvents;
  storage?: StorageManager;
  autoDriver?: boolean;
}

export function formatTimerMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class PomodoroController {
  public phase: PomodoroPhase = 'idle';
  public endsAtMs: number | null = null;
  public pausedRemainingMs: number | null = null;
  public focusMin: number = 25;
  public breakMin: number = 5;
  public preset: PomoPreset = '25/5';

  public now: () => number;
  private audio?: ChimeScheduler;
  private events: GameEvents;
  private storage: StorageManager;
  private chimeHandle: any = null;
  private chimeScheduled = false;
  private listeners = new Set<(state: PomodoroState) => void>();
  private driverTimerId: any = null;
  private onVisibilityChange?: () => void;
  private unsubStorage?: () => void;

  constructor(options?: PomodoroControllerOptions) {
    this.now = options?.now ?? (() => Date.now());
    this.audio = options?.audio ?? audioEngine;
    this.events = options?.gameEvents ?? gameEvents;
    this.storage = options?.storage ?? defaultStorageManager;

    const initialPrefs = this.storage.get().pomo;
    this.preset = options?.preset ?? initialPrefs.preset ?? '25/5';
    this.focusMin = options?.focusMin ?? initialPrefs.focusMin ?? 25;
    this.breakMin = options?.breakMin ?? initialPrefs.breakMin ?? 5;

    if (options?.phase) {
      this.phase = options.phase;
    }
    if (options?.endsAtMs !== undefined) {
      this.endsAtMs = options.endsAtMs;
    }
    if (options?.pausedRemainingMs !== undefined) {
      this.pausedRemainingMs = options.pausedRemainingMs;
    }

    // Subscribe to storage changes: if timer is idle, sync preset/minutes
    this.unsubStorage = this.storage.subscribe((prefs: StoragePrefs) => {
      const p = prefs.pomo;
      this.preset = p.preset;
      this.focusMin = p.focusMin;
      this.breakMin = p.breakMin;
      if (this.phase === 'idle') {
        this.notify();
      }
    });

    // Mid-focus check: if loaded mid-focus, schedule chime
    if (this.phase === 'focus' && this.endsAtMs !== null && this.endsAtMs > this.now()) {
      this.scheduleChime();
    }

    if (options?.autoDriver !== false) {
      this.startDriver();
    }
  }

  public getState(): PomodoroState {
    return {
      phase: this.phase,
      endsAtMs: this.endsAtMs,
      pausedRemainingMs: this.pausedRemainingMs,
      focusMin: this.focusMin,
      breakMin: this.breakMin,
      preset: this.preset,
    };
  }

  public remainingMs(): number {
    if (this.endsAtMs !== null) {
      return Math.max(0, this.endsAtMs - this.now());
    }
    if (this.pausedRemainingMs !== null) {
      return this.pausedRemainingMs;
    }
    if (this.phase === 'break') {
      return this.breakMin * 60 * 1000;
    }
    return this.focusMin * 60 * 1000;
  }

  public localBadge(): PomoBadge {
    if (this.phase === 'focus') return 'focus';
    if (this.phase === 'break') return 'break';
    return 'none';
  }

  public start(): void {
    this.phase = 'focus';
    this.endsAtMs = this.now() + this.focusMin * 60 * 1000;
    this.pausedRemainingMs = null;

    this.scheduleChime();
    this.emitPhaseChanged();
    this.notify();
  }

  public pause(): void {
    if (this.phase === 'idle' || this.pausedRemainingMs !== null) {
      return;
    }
    this.pausedRemainingMs = this.remainingMs();
    this.endsAtMs = null;
    this.cancelChime();
    this.emitPhaseChanged();
    this.notify();
  }

  public resume(): void {
    if (this.pausedRemainingMs === null) {
      return;
    }
    const remaining = this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    this.endsAtMs = this.now() + remaining;
    if (this.phase === 'focus') {
      this.scheduleChime();
    }
    this.emitPhaseChanged();
    this.notify();
  }

  public reset(): void {
    this.phase = 'idle';
    this.endsAtMs = null;
    this.pausedRemainingMs = null;
    this.cancelChime();
    this.emitPhaseChanged();
    this.notify();
  }

  public skip(): PomodoroTickResult {
    this.cancelChime();
    const prevPhase = this.phase;
    let nextPhase: PomodoroPhase;

    if (this.phase === 'focus') {
      nextPhase = 'break';
      this.endsAtMs = this.now() + this.breakMin * 60 * 1000;
    } else {
      nextPhase = 'focus';
      this.endsAtMs = this.now() + this.focusMin * 60 * 1000;
    }

    this.phase = nextPhase;
    this.pausedRemainingMs = null;

    if (nextPhase === 'focus') {
      this.scheduleChime();
    }

    this.emitPhaseChanged();
    this.notify();

    return {
      transitioned: true,
      from: prevPhase,
      to: nextPhase,
      transitions: [{ from: prevPhase, to: nextPhase }],
    };
  }

  public tick(): PomodoroTickResult {
    const currentNow = this.now();
    if (this.phase === 'idle' || this.endsAtMs === null) {
      return {
        transitioned: false,
        from: this.phase,
        to: this.phase,
        transitions: [],
      };
    }

    if (currentNow < this.endsAtMs) {
      return {
        transitioned: false,
        from: this.phase,
        to: this.phase,
        transitions: [],
      };
    }

    const prevPhase = this.phase;
    const focusDuration = this.focusMin * 60 * 1000;
    const breakDuration = this.breakMin * 60 * 1000;
    const cycleDuration = focusDuration + breakDuration;

    let newPhase: PomodoroPhase;
    let newEndsAtMs: number;
    const transitions: PomodoroTransition[] = [];

    if (this.phase === 'focus') {
      const phaseStartMs = this.endsAtMs - focusDuration;
      const elapsedSinceStart = currentNow - phaseStartMs;
      const fullCycles = Math.floor(elapsedSinceStart / cycleDuration);
      const cycleStartMs = phaseStartMs + fullCycles * cycleDuration;
      const offsetInCycle = elapsedSinceStart % cycleDuration;

      if (offsetInCycle < focusDuration) {
        newPhase = 'focus';
        newEndsAtMs = cycleStartMs + focusDuration;
        transitions.push({ from: 'break', to: 'focus' });
      } else {
        newPhase = 'break';
        newEndsAtMs = cycleStartMs + cycleDuration;
        transitions.push({ from: 'focus', to: 'break' });
      }
    } else {
      const phaseStartMs = this.endsAtMs - breakDuration;
      const elapsedSinceStart = currentNow - phaseStartMs;
      const fullCycles = Math.floor(elapsedSinceStart / cycleDuration);
      const cycleStartMs = phaseStartMs + fullCycles * cycleDuration;
      const offsetInCycle = elapsedSinceStart % cycleDuration;

      if (offsetInCycle < breakDuration) {
        newPhase = 'break';
        newEndsAtMs = cycleStartMs + breakDuration;
        transitions.push({ from: 'focus', to: 'break' });
      } else {
        newPhase = 'focus';
        newEndsAtMs = cycleStartMs + breakDuration + focusDuration;
        transitions.push({ from: 'break', to: 'focus' });
      }
    }

    this.phase = newPhase;
    this.endsAtMs = newEndsAtMs;

    if (newPhase === 'focus') {
      this.scheduleChime();
    } else {
      this.cancelChime();
    }

    this.emitPhaseChanged();
    this.notify();

    return {
      transitioned: true,
      from: prevPhase,
      to: newPhase,
      transitions,
    };
  }

  public setPreset(
    preset: PomoPreset,
    customFocusMin?: number,
    customBreakMin?: number
  ): void {
    let f = this.focusMin;
    let b = this.breakMin;

    if (preset === '25/5') {
      f = 25;
      b = 5;
    } else if (preset === '50/10') {
      f = 50;
      b = 10;
    } else if (preset === 'custom') {
      if (customFocusMin !== undefined) {
        f = Math.max(1, Math.min(180, Math.round(customFocusMin)));
      }
      if (customBreakMin !== undefined) {
        b = Math.max(1, Math.min(60, Math.round(customBreakMin)));
      }
    }

    this.preset = preset;
    this.focusMin = f;
    this.breakMin = b;

    this.storage.update({
      pomo: {
        preset,
        focusMin: f,
        breakMin: b,
      },
    });

    if (this.phase === 'idle') {
      this.notify();
    }
  }

  public subscribe(listener: (state: PomodoroState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(s);
      } catch (err) {
        console.error('[PomodoroController] Listener error:', err);
      }
    }
  }

  private emitPhaseChanged(): void {
    this.events.emit('pomoPhaseChanged', {
      phase: this.localBadge(),
      endsAtMs: this.endsAtMs,
    });
  }

  private scheduleChime(): void {
    this.cancelChime();
    if (this.audio && this.endsAtMs !== null) {
      this.chimeHandle = this.audio.scheduleChime(this.endsAtMs);
      this.chimeScheduled = true;
    }
  }

  private cancelChime(): void {
    if (this.chimeScheduled) {
      if (this.audio && typeof this.audio.cancelChime === 'function') {
        this.audio.cancelChime(this.chimeHandle);
      } else if (this.chimeHandle && typeof this.chimeHandle.stop === 'function') {
        this.chimeHandle.stop();
      }
      this.chimeHandle = null;
      this.chimeScheduled = false;
    }
  }

  private startDriver(): void {
    if (typeof setInterval !== 'undefined') {
      this.driverTimerId = setInterval(() => {
        this.tick();
      }, 250);
    }

    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        this.tick();
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  public destroy(): void {
    if (this.driverTimerId) {
      clearInterval(this.driverTimerId);
      this.driverTimerId = null;
    }
    if (typeof document !== 'undefined' && this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = undefined;
    }
    if (this.unsubStorage) {
      this.unsubStorage();
      this.unsubStorage = undefined;
    }
    this.cancelChime();
    this.listeners.clear();
  }
}

export const pomodoroController = new PomodoroController();
export default pomodoroController;
