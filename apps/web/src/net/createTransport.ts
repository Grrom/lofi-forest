import { isValidRoomCode, PUBLIC_ROOM_CODE } from '@lofi/shared';
import type { TransportAdapter, TransportMode } from './TransportAdapter';
import { LocalTransport } from './LocalTransport';

export type TransportFactory = (room?: string) => TransportAdapter;

export const transportRegistry = new Map<TransportMode, TransportFactory>();

// Register solo mode by default
transportRegistry.set('solo', () => new LocalTransport());

export function registerTransport(mode: TransportMode, factory: TransportFactory): void {
  transportRegistry.set(mode, factory);
}

export function unregisterTransport(mode: TransportMode): void {
  if (mode !== 'solo') {
    transportRegistry.delete(mode);
  }
}

export function parseRoomParam(
  input?: string | URLSearchParams | { room?: string | null } | null
): string | null {
  if (input == null) {
    if (typeof window !== 'undefined' && window.location?.search) {
      return new URLSearchParams(window.location.search).get('room');
    }
    return null;
  }
  if (input instanceof URLSearchParams) {
    return input.get('room');
  }
  if (typeof input === 'object' && 'room' in input) {
    return input.room ?? null;
  }
  if (typeof input === 'string') {
    if (input.startsWith('?') || input.includes('=')) {
      const search = input.startsWith('?') ? input.slice(1) : input;
      return new URLSearchParams(search).get('room');
    }
    return input.trim() || null;
  }
  return null;
}

export function createTransport(
  input?: string | URLSearchParams | { room?: string | null } | null
): TransportAdapter {
  const room = parseRoomParam(input);

  let targetMode: TransportMode = 'solo';

  if (!room) {
    targetMode = 'solo';
  } else if (room === PUBLIC_ROOM_CODE) {
    targetMode = 'public';
  } else if (isValidRoomCode(room)) {
    targetMode = 'p2p';
  } else {
    console.warn(`[createTransport] Invalid room code "${room}". Falling back to solo.`);
    targetMode = 'solo';
  }

  const factory = transportRegistry.get(targetMode);
  if (!factory) {
    console.warn(
      `[createTransport] Transport mode "${targetMode}" is not registered. Falling back to solo.`
    );
    const soloFactory = transportRegistry.get('solo');
    if (!soloFactory) {
      return new LocalTransport();
    }
    return soloFactory();
  }

  return factory(room ?? undefined);
}
