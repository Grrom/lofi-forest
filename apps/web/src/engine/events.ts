import type { EmoteId, PomoBadge, ZoneId } from '@lofi/shared';

export interface GameEventPayloads {
  zoneChanged: { zone: ZoneId };
  teleported: { x: number; y: number };
  pomoPhaseChanged: { phase: PomoBadge | string; endsAtMs: number };
  localEmote: { emote: EmoteId };
  localInput: Record<string, unknown> | void;
}

export type GameEventName = keyof GameEventPayloads;
export type GameEventHandler<K extends GameEventName> = (
  payload: GameEventPayloads[K]
) => void;

export class GameEvents {
  private handlers = new Map<GameEventName, Set<GameEventHandler<any>>>();

  /**
   * Subscribe to a typed game event. Returns an unsubscribe function.
   */
  public on<K extends GameEventName>(
    event: K,
    handler: GameEventHandler<K>
  ): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Unsubscribe a handler from an event.
   */
  public off<K extends GameEventName>(
    event: K,
    handler: GameEventHandler<K>
  ): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit a typed event payload to all subscribed listeners.
   */
  public emit<K extends GameEventName>(
    event: K,
    payload?: GameEventPayloads[K]
  ): void {
    const set = this.handlers.get(event);
    if (set) {
      // Snapshot the handlers to avoid issues if a listener unsubscribes during emit
      const snapshot = Array.from(set);
      for (const handler of snapshot) {
        handler(payload as GameEventPayloads[K]);
      }
    }
  }

  /**
   * Remove all listeners for a given event, or all listeners if event is omitted.
   */
  public removeAllListeners(event?: GameEventName): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

export const gameEvents = new GameEvents();
