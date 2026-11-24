import type { EmoteId, PlayerNetState } from '@lofi/shared';

export type TransportMode = 'solo' | 'p2p' | 'public';
export type TransportStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'room_full';

export interface TransportAdapter {
  readonly mode: TransportMode;
  connect(): Promise<void>;
  disconnect(): void;
  sendLocalState(state: Omit<PlayerNetState, 'id'>): void;
  sendEmote(e: EmoteId): void;
  onPlayersChange(cb: (players: Map<string, PlayerNetState>) => void): () => void;
  onEmote(cb: (playerId: string, e: EmoteId) => void): () => void;
  onStatusChange(cb: (status: TransportStatus) => void): () => void;
}
