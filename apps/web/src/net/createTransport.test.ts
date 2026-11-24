import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTransport,
  registerTransport,
  transportRegistry,
  unregisterTransport,
} from './createTransport';
import { LocalTransport } from './LocalTransport';

describe('createTransport', () => {
  beforeEach(() => {
    unregisterTransport('p2p');
    unregisterTransport('public');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    unregisterTransport('p2p');
    unregisterTransport('public');
  });

  // Acceptance criterion:
  // Tests: createTransport with ?room=pine-482 and no p2p registered returns solo and warns; ?room=Bad Code returns solo.
  it('createTransport with ?room=pine-482 and no p2p registered returns solo and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createTransport('?room=pine-482');

    expect(transport.mode).toBe('solo');
    expect(transport).toBeInstanceOf(LocalTransport);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Transport mode "p2p" is not registered. Falling back to solo.'
      )
    );
  });

  it('createTransport with ?room=Bad Code returns solo and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createTransport('?room=Bad Code');

    expect(transport.mode).toBe('solo');
    expect(transport).toBeInstanceOf(LocalTransport);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid room code "Bad Code". Falling back to solo.')
    );
  });

  it('createTransport with no room param returns solo without warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createTransport();

    expect(transport.mode).toBe('solo');
    expect(transport).toBeInstanceOf(LocalTransport);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('createTransport with ?room=public without public registered returns solo and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createTransport('?room=public');

    expect(transport.mode).toBe('solo');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Transport mode "public" is not registered. Falling back to solo.'
      )
    );
  });

  it('createTransport uses registered transport when available', () => {
    const mockP2PTransport = {
      mode: 'p2p' as const,
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendLocalState: vi.fn(),
      sendEmote: vi.fn(),
      onPlayersChange: vi.fn(),
      onEmote: vi.fn(),
      onStatusChange: vi.fn(),
    };
    registerTransport('p2p', (room) => mockP2PTransport);

    const transport = createTransport('?room=forest-123');
    expect(transport.mode).toBe('p2p');
    expect(transport).toBe(mockP2PTransport);
  });
});
