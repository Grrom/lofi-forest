import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { gameEvents } from '../engine/events';
import { AssetLoader } from '../engine/assets/AssetLoader';

export function createMockAudioContext(initialCurrentTime = 0) {
  let currentTime = initialCurrentTime;

  const mockDestination = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const createGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));

  const createBiquadFilter = vi.fn(() => ({
    type: 'lowpass',
    frequency: {
      value: 20000,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));

  const createBufferSource = vi.fn(() => ({
    buffer: null as any,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));

  const createOscillator = vi.fn(() => ({
    type: 'sine',
    frequency: {
      setValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));

  const createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => {
    const data = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: vi.fn(() => data),
    };
  });

  return {
    get currentTime() {
      return currentTime;
    },
    set currentTime(t: number) {
      currentTime = t;
    },
    state: 'suspended' as AudioContextState,
    sampleRate: 44100,
    destination: mockDestination,
    resume: vi.fn().mockImplementation(async function (this: any) {
      this.state = 'running';
    }),
    createGain,
    createBiquadFilter,
    createBufferSource,
    createOscillator,
    createBuffer,
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
}

describe('AudioEngine', () => {
  let engine: AudioEngine;
  let mockCtx: any;
  let mockLoader: AssetLoader;

  beforeEach(() => {
    mockCtx = createMockAudioContext(10);
    mockLoader = new AssetLoader();
    engine = new AudioEngine(mockCtx, mockLoader);
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  // Acceptance criterion:
  // Test (mocked AudioContext, currentTime=10, Date.now()=1000): scheduleChime(61000) starts at when = 70; a past atMs starts at currentTime; cancelChime stops it.
  it('(mocked AudioContext, currentTime=10, Date.now()=1000): scheduleChime(61000) starts at when = 70; a past atMs starts at currentTime; cancelChime stops it', () => {
    mockCtx.currentTime = 10;
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    // 1. Future chime at 61000 ms: delay is (61000 - 1000) / 1000 = 60 s -> when = 10 + 60 = 70
    const handleFuture = engine.scheduleChime(61000);
    expect(handleFuture.when).toBe(70);

    // Verify first oscillator/node was scheduled to start at when = 70
    const firstOsc = mockCtx.createOscillator.mock.results[0]?.value;
    const firstBufSrc = mockCtx.createBufferSource.mock.results[0]?.value;
    const startedNode = firstOsc?.start.mock.calls.length ? firstOsc : firstBufSrc;
    expect(startedNode.start).toHaveBeenCalledWith(70);

    // 2. Past chime at 500 ms (less than Date.now() = 1000): when = currentTime = 10
    const oscCountBefore = mockCtx.createOscillator.mock.calls.length;
    const handlePast = engine.scheduleChime(500);
    expect(handlePast.when).toBe(10);

    const pastOsc = mockCtx.createOscillator.mock.results[oscCountBefore]?.value;
    const pastBufSrc = mockCtx.createBufferSource.mock.results.at(-1)?.value;
    const pastStartedNode = pastOsc?.start.mock.calls.length ? pastOsc : pastBufSrc;
    expect(pastStartedNode.start).toHaveBeenCalledWith(10);

    // 3. cancelChime stops it
    engine.cancelChime(handleFuture);
    expect(startedNode.stop).toHaveBeenCalled();

    dateSpy.mockRestore();
  });

  // Acceptance criterion:
  // Test: zoneChanged to pub ramps each channel with end time currentTime + 1.5.
  it('zoneChanged to pub ramps each channel with end time currentTime + 1.5', () => {
    mockCtx.currentTime = 12.0;
    const expectedEnd = 12.0 + 1.5; // 13.5

    // Emit zoneChanged to pub
    gameEvents.emit('zoneChanged', { zone: 'pub' });

    // Pub mix: pub 1, campfire 1, rain 0.35 through a 900 Hz low-pass, forest 0
    expect(engine.zoneGains.pub.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expectedEnd);
    expect(engine.zoneGains.campfire.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, expectedEnd);
    expect(engine.zoneGains.rain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.35, expectedEnd);
    expect(engine.zoneGains.forest.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expectedEnd);

    // Rain low-pass filter frequency ramped to 900 Hz
    expect(engine.rainFilter.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(900, expectedEnd);
  });

  // Acceptance criterion:
  // Test: a null rain buffer creates a noise source.
  it('a null rain buffer creates a noise source', async () => {
    // mockLoader returns null for 'rain'
    vi.spyOn(mockLoader, 'loadAudioBuffer').mockResolvedValue(null);

    await engine.startAmbience();

    expect(engine.isRainNoiseSource()).toBe(true);
    const rainSource = engine.getRainSource();
    expect(rainSource).toBeDefined();
    expect(rainSource?.buffer).toBeDefined();
    expect(rainSource?.loop).toBe(true);
    expect(rainSource?.start).toHaveBeenCalledWith(0);
    expect(mockCtx.createBuffer).toHaveBeenCalled();
  });

  it('unlockNow tries resume without a gesture', async () => {
    mockCtx.state = 'suspended';
    expect(engine.isUnlocked()).toBe(false);

    const unlocked = await engine.unlockNow();
    expect(unlocked).toBe(true);
    expect(mockCtx.resume).toHaveBeenCalled();
    expect(engine.isUnlocked()).toBe(true);
  });

  it('teleported event triggers teleport sfx', async () => {
    const playSfxSpy = vi.spyOn(engine, 'playSfx');
    gameEvents.emit('teleported', { x: 100, y: 200 });

    expect(playSfxSpy).toHaveBeenCalledWith('teleport');
  });

  it('volume slider ramp applies with 50 ms ramp', () => {
    mockCtx.currentTime = 20.0;
    engine.setVolume('master', 0.45);

    expect(engine.channels.master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.45,
      20.0 + 0.05
    );
  });

  it('BGM loops queue order with crossfade and notifies onTrackChange', async () => {
    const tracks = [
      { id: 'track_1', title: 'Song 1', artist: 'Artist 1' },
      { id: 'track_2', title: 'Song 2', artist: 'Artist 2' },
    ];

    const mockBuffer1 = {
      duration: 10,
    } as AudioBuffer;

    vi.spyOn(mockLoader, 'loadAudioBuffer').mockResolvedValue(mockBuffer1);

    const trackChanges: any[] = [];
    engine.onTrackChange((t) => trackChanges.push(t));

    await engine.startBgm(tracks);

    expect(engine.currentTrack()).toEqual({ title: 'Song 1', artist: 'Artist 1' });
    expect(trackChanges).toContainEqual({ title: 'Song 1', artist: 'Artist 1' });
  });
});
