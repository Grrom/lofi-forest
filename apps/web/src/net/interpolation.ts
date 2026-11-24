import { INTERP_DELAY_MS, TELEPORT_SNAP_PX } from '@lofi/shared';

export interface InterpolationSnapshot {
  t: number;
  x: number;
  y?: number;
  [key: string]: any;
}

export interface InterpolatedPosition {
  x: number;
  y: number;
}

export class InterpolationBuffer {
  public snapshots: InterpolationSnapshot[] = [];

  public push(snapshot: InterpolationSnapshot): void {
    const snap = {
      ...snapshot,
      y: snapshot.y ?? 0,
    };

    if (this.snapshots.length === 0 || snap.t >= this.snapshots[this.snapshots.length - 1].t) {
      this.snapshots.push(snap);
    } else {
      const idx = this.snapshots.findIndex((s) => s.t > snap.t);
      if (idx === -1) {
        this.snapshots.push(snap);
      } else {
        this.snapshots.splice(idx, 0, snap);
      }
    }

    // Keep buffer bounded
    if (this.snapshots.length > 60) {
      this.snapshots.splice(0, this.snapshots.length - 60);
    }
  }

  public add(snapshot: InterpolationSnapshot): void {
    this.push(snapshot);
  }

  public clear(): void {
    this.snapshots = [];
  }

  public get length(): number {
    return this.snapshots.length;
  }

  public sample(nowMs: number, delayMs: number = INTERP_DELAY_MS): InterpolatedPosition | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    const renderTime = nowMs - delayMs;

    // If renderTime is before or at the first snapshot, return first snapshot
    if (renderTime <= this.snapshots[0].t) {
      return {
        x: this.snapshots[0].x,
        y: this.snapshots[0].y ?? 0,
      };
    }

    // If renderTime is at or past the last snapshot, hold the last snapshot
    const last = this.snapshots[this.snapshots.length - 1];
    if (renderTime >= last.t) {
      return {
        x: last.x,
        y: last.y ?? 0,
      };
    }

    // Find the pair [s0, s1] such that s0.t <= renderTime <= s1.t
    for (let i = 0; i < this.snapshots.length - 1; i++) {
      const s0 = this.snapshots[i];
      const s1 = this.snapshots[i + 1];

      if (s0.t <= renderTime && renderTime <= s1.t) {
        const dx = s1.x - s0.x;
        const dy = (s1.y ?? 0) - (s0.y ?? 0);
        const dist = Math.hypot(dx, dy);

        // Snap when consecutive snapshots are more than TELEPORT_SNAP_PX apart
        if (dist > TELEPORT_SNAP_PX) {
          return {
            x: s1.x,
            y: s1.y ?? 0,
          };
        }

        const dt = s1.t - s0.t;
        const alpha = dt > 0 ? (renderTime - s0.t) / dt : 1;

        return {
          x: s0.x + alpha * dx,
          y: (s0.y ?? 0) + alpha * dy,
        };
      }
    }

    return {
      x: last.x,
      y: last.y ?? 0,
    };
  }
}
