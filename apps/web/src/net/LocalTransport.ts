import type { EmoteId, PlayerNetState } from '@lofi/shared';
import type { TransportAdapter, TransportMode, TransportStatus } from './TransportAdapter';

export class LocalTransport implements TransportAdapter {
  public readonly mode: TransportMode = 'solo';
  private status: TransportStatus = 'connected';
  private statusListeners = new Set<(status: TransportStatus) => void>();
  private playersListeners = new Set<(players: Map<string, PlayerNetState>) => void>();
  private emoteListeners = new Set<(playerId: string, e: EmoteId) => void>();

  public async connect(): Promise<void> {
    this.status = 'connected';
    this.notifyStatus('connected');
  }

  public disconnect(): void {
    this.status = 'disconnected';
    this.notifyStatus('disconnected');
  }

  public sendLocalState(_state: Omit<PlayerNetState, 'id'>): void {
    // Solo mode: no remote peers to send to
  }

  public sendEmote(_e: EmoteId): void {
    // Solo mode: no remote peers to send to
  }

  public onPlayersChange(cb: (players: Map<string, PlayerNetState>) => void): () => void {
    this.playersListeners.add(cb);
    // Solo mode: no remote players
    cb(new Map());
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

  private notifyStatus(status: TransportStatus): void {
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }
}
