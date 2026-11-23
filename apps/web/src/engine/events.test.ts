import { describe, it, expect, vi } from 'vitest';
import { GameEvents, gameEvents } from './events';

describe('GameEvents', () => {
  // Acceptance criterion:
  // Test: GameEvents delivers typed payloads and supports unsubscribe.
  it('GameEvents delivers typed payloads and supports unsubscribe', () => {
    const events = new GameEvents();

    const zoneHandler = vi.fn();
    const teleportHandler = vi.fn();
    const pomoHandler = vi.fn();
    const emoteHandler = vi.fn();
    const inputHandler = vi.fn();

    const unsubZone = events.on('zoneChanged', zoneHandler);
    const unsubTeleport = events.on('teleported', teleportHandler);
    const unsubPomo = events.on('pomoPhaseChanged', pomoHandler);
    const unsubEmote = events.on('localEmote', emoteHandler);
    const unsubInput = events.on('localInput', inputHandler);

    // Emit typed payloads
    events.emit('zoneChanged', { zone: 'lake' });
    expect(zoneHandler).toHaveBeenCalledTimes(1);
    expect(zoneHandler).toHaveBeenCalledWith({ zone: 'lake' });

    events.emit('teleported', { x: 500, y: 300 });
    expect(teleportHandler).toHaveBeenCalledTimes(1);
    expect(teleportHandler).toHaveBeenCalledWith({ x: 500, y: 300 });

    events.emit('pomoPhaseChanged', { phase: 'focus', endsAtMs: 1700000000 });
    expect(pomoHandler).toHaveBeenCalledTimes(1);
    expect(pomoHandler).toHaveBeenCalledWith({ phase: 'focus', endsAtMs: 1700000000 });

    events.emit('localEmote', { emote: 'coffee' });
    expect(emoteHandler).toHaveBeenCalledTimes(1);
    expect(emoteHandler).toHaveBeenCalledWith({ emote: 'coffee' });

    events.emit('localInput', {});
    expect(inputHandler).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubZone();
    unsubTeleport();
    unsubPomo();
    unsubEmote();
    unsubInput();

    // Emitting again should not trigger unsubscribed handlers
    events.emit('zoneChanged', { zone: 'pub' });
    events.emit('teleported', { x: 100, y: 100 });
    events.emit('pomoPhaseChanged', { phase: 'break', endsAtMs: 1800000000 });
    events.emit('localEmote', { emote: 'heart' });
    events.emit('localInput', {});

    expect(zoneHandler).toHaveBeenCalledTimes(1);
    expect(teleportHandler).toHaveBeenCalledTimes(1);
    expect(pomoHandler).toHaveBeenCalledTimes(1);
    expect(emoteHandler).toHaveBeenCalledTimes(1);
    expect(inputHandler).toHaveBeenCalledTimes(1);
  });

  it('exports singleton gameEvents instance', () => {
    expect(gameEvents).toBeInstanceOf(GameEvents);
  });

  it('enforces typed payloads at compile time', () => {
    const events = new GameEvents();
    // @ts-expect-error missing payload
    events.emit('teleported');

    // @ts-expect-error wrong payload
    events.emit('zoneChanged', { zone: 'moon' });
  });
});
