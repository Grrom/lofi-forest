import {
  parseSpectatorParams,
  epochCycle,
  type SpectatorParams,
  type EpochCycleResult,
} from '@lofi/shared';

export {
  parseSpectatorParams,
  epochCycle,
  type SpectatorParams,
  type EpochCycleResult,
};

export interface SpectatorCycleEffects {
  setVignette?: (enabled: boolean) => void;
  pulseGlow?: () => void;
  scheduleChime?: (endsAtMs: number) => any;
}

export interface SpectatorCycleOptions {
  focusMin?: number;
  breakMin?: number;
  now?: () => number;
  effects?: SpectatorCycleEffects;
  autoStart?: boolean;
}

export class SpectatorCycleController {
  public focusMin: number;
  public breakMin: number;
  public phase: 'focus' | 'break' = 'focus';
  public endsAtMs: number = 0;
  private now: () => number;
  private effects: SpectatorCycleEffects;
  private timerId: any = null;
  private lastScheduledChimeEndsAt: number | null = null;

  constructor(options: SpectatorCycleOptions = {}) {
    this.focusMin = options.focusMin ?? 50;
    this.breakMin = options.breakMin ?? 10;
    this.now = options.now ?? (() => Date.now());
    this.effects = options.effects ?? {};

    if (options.autoStart !== false) {
      this.start();
    }
  }

  public start(initialNowMs?: number): void {
    const nowMs = initialNowMs ?? this.now();
    const cycle = epochCycle(nowMs, this.focusMin, this.breakMin);
    this.phase = cycle.phase;
    this.endsAtMs = cycle.endsAtMs;

    if (this.phase === 'focus') {
      this.effects.setVignette?.(true);
      this.maybeScheduleChime(this.endsAtMs);
    } else {
      this.effects.setVignette?.(false);
    }

    if (!this.timerId) {
      this.timerId = setInterval(() => {
        this.tick();
      }, 250);
    }
  }

  public tick(currentTimeMs?: number): void {
    const nowMs = currentTimeMs ?? this.now();
    const cycle = epochCycle(nowMs, this.focusMin, this.breakMin);
    const prevPhase = this.phase;
    this.phase = cycle.phase;
    this.endsAtMs = cycle.endsAtMs;

    if (prevPhase === 'break' && cycle.phase === 'focus') {
      // Entering focus phase: vignette on, schedule chime
      this.effects.setVignette?.(true);
      this.maybeScheduleChime(cycle.endsAtMs);
    } else if (prevPhase === 'focus' && cycle.phase === 'break') {
      // focus → break: pulseGlow() and vignette off
      this.effects.pulseGlow?.();
      this.effects.setVignette?.(false);
    }
  }

  private maybeScheduleChime(endsAtMs: number): void {
    if (this.lastScheduledChimeEndsAt !== endsAtMs) {
      this.lastScheduledChimeEndsAt = endsAtMs;
      this.effects.scheduleChime?.(endsAtMs);
    }
  }

  public destroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
