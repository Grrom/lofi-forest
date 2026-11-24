import type { PlayerNetState, ZoneId } from '@lofi/shared';
import { PlayerAvatar, type PlayerAvatarOptions } from './PlayerAvatar';
import { InterpolationBuffer } from '../net/interpolation';

export interface RemotePlayerOptions extends PlayerAvatarOptions {
  id: string;
  zone?: ZoneId;
  x?: number;
  y?: number;
  hideNames?: boolean;
}

export class RemotePlayer extends PlayerAvatar {
  public readonly id: string;
  public zone: ZoneId;
  public readonly buffer: InterpolationBuffer;
  public hideNames?: boolean;

  constructor(state: PlayerNetState | RemotePlayerOptions) {
    super({
      outfit: state.outfit,
      facing: state.facing,
      action: state.action,
      name: (state as any).hideNames ? null : state.name,
      status: (state as PlayerNetState).pomo ?? (state as any).status ?? 'none',
    });

    this.label = 'remotePlayer';
    this.id = state.id;
    this.zone = state.zone ?? 'forest';
    this.buffer = new InterpolationBuffer();
    if ((state as any).hideNames) {
      this.hideNames = true;
      this.setName(null);
    }

    const initialX = state.x ?? (state as any).initialX ?? 0;
    const initialY = state.y ?? (state as any).initialY ?? 0;
    this.x = initialX;
    this.y = initialY;
    this.position.set(Math.round(initialX), Math.round(initialY));
    (this as any).footY = initialY;
    this.zIndex = Math.round(initialY);

    this.buffer.push({
      t: Date.now(),
      x: initialX,
      y: initialY,
    });
  }

  public updateState(state: PlayerNetState, now: number = Date.now()): void {
    this.buffer.push({
      t: now,
      x: state.x,
      y: state.y,
    });
    this.zone = state.zone;
    this.setAction(state.action);
    this.setFacing(state.facing);
    this.setOutfit(state.outfit);
    if (this.hideNames) {
      this.setName(null);
    } else {
      this.setName(state.name);
    }
    this.setStatus(state.pomo);
  }

  public override update(dt: number, now: number = Date.now()): void {
    const pos = this.buffer.sample(now);
    if (pos) {
      this.x = pos.x;
      this.y = pos.y;
      this.position.set(Math.round(pos.x), Math.round(pos.y));
      (this as any).footY = pos.y;
      this.zIndex = Math.round(pos.y);
    }
    super.update(dt, now);
  }
}
