import type { PlayerAction } from '@lofi/shared';

export interface AnimationSample {
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/**
 * ProceduralAnimator calculates transformation offsets for character actions.
 * Pure module without PixiJS dependencies for testability.
 *
 * Behaviors:
 * - idle: scaleY 0.98–1.02 over samples
 * - walk: hop
 * - vibe: squash and stretch plus ±0.06 rad tilt
 * - sit: gentle breathing
 * - sleep: squish
 * - celebrate: a 3 s bounce arc with squash on landing; neutral (offsetY=0) at t >= 3000 ms
 */
export function sample(action: PlayerAction, tMs: number): AnimationSample {
  switch (action) {
    case 'idle': {
      // Idle: gentle breathing cycle (period 2000 ms), scaleY strictly within [0.98, 1.02]
      const phase = (tMs % 2000) / 2000;
      const s = Math.sin(phase * 2 * Math.PI);
      const scaleY = 1 + 0.02 * s;
      const scaleX = 1 - 0.01 * s;
      return {
        offsetY: 0,
        scaleX,
        scaleY,
        rotation: 0,
      };
    }

    case 'walk': {
      // Walk: rhythmic hop bounce (period 300 ms)
      const phase = (tMs % 300) / 300;
      const hop = Math.sin(phase * Math.PI) * 3;
      const squash = Math.sin(phase * Math.PI) * 0.04;
      return {
        offsetY: -hop,
        scaleX: 1 - squash,
        scaleY: 1 + squash,
        rotation: 0,
      };
    }

    case 'vibe': {
      // Vibe: squash and stretch plus ±0.06 rad tilt (period 600 ms)
      const phase = (tMs % 600) / 600;
      const rotation = 0.06 * Math.sin(phase * 2 * Math.PI);
      const squash = 0.08 * Math.sin(phase * 4 * Math.PI);
      const offsetY = -Math.abs(Math.sin(phase * 2 * Math.PI)) * 2;
      return {
        offsetY,
        scaleX: 1 - squash,
        scaleY: 1 + squash,
        rotation,
      };
    }

    case 'sit': {
      // Sit: subtle breathing
      const phase = (tMs % 2400) / 2400;
      const breath = 0.015 * Math.sin(phase * 2 * Math.PI);
      return {
        offsetY: 0,
        scaleX: 1 - breath * 0.5,
        scaleY: 1 + breath,
        rotation: 0,
      };
    }

    case 'sleep': {
      // Sleep: squish (scaleY ~0.92, scaleX ~1.08)
      const phase = (tMs % 2000) / 2000;
      const breath = 0.02 * Math.sin(phase * 2 * Math.PI);
      return {
        offsetY: 1,
        scaleX: 1.08 - breath,
        scaleY: 0.92 + breath,
        rotation: 0,
      };
    }

    case 'celebrate': {
      // Celebrate: 3 s bounce arc with squash on landing; neutral at t >= 3000 ms
      if (tMs >= 3000 || tMs < 0) {
        return {
          offsetY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        };
      }

      // Three 1000 ms bounce cycles
      const cycle = tMs % 1000;
      if (cycle < 700) {
        // Airborne bounce arc
        const p = cycle / 700;
        const jumpH = Math.sin(p * Math.PI) * 10;
        return {
          offsetY: -jumpH,
          scaleX: 0.95,
          scaleY: 1.05,
          rotation: 0,
        };
      } else {
        // Landing squash
        const p = (cycle - 700) / 300;
        const squash = Math.sin(p * Math.PI) * 0.15;
        return {
          offsetY: 0,
          scaleX: 1 + squash,
          scaleY: 1 - squash,
          rotation: 0,
        };
      }
    }

    default:
      return {
        offsetY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
  }
}

export class ProceduralAnimator {
  public static sample(action: PlayerAction, tMs: number): AnimationSample {
    return sample(action, tMs);
  }
}
