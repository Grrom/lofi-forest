import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { gameEvents } from '../engine/events';
import { AssetLoader } from '../engine/assets/AssetLoader';
import { createMockAudioContext } from './mockAudioContext';

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

    // With synth fallback: 4 oscillators created for handleFuture
    const futureOscs = mockCtx.createOscillator.mock.results.slice(0, 4).map((r: any) => r.value);
    expect(futureOscs.length).toBe(4);
    for (const osc of futureOscs) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.start.mock.calls[0][0]).toBeGreaterThanOrEqual(70);
    }

    // 2. Past chime at 500 ms (less than Date.now() = 1000): when = currentTime = 10
    const handlePast = engine.scheduleChime(500);
    expect(handlePast.when).toBe(10);

    const pastOscs = mockCtx.createOscillator.mock.results.slice(4, 8).map((r: any) => r.value);
    expect(pastOscs.length).toBe(4);
    for (const osc of pastOscs) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.start.mock.calls[0][0]).toBeGreaterThanOrEqual(10);
      expect(osc.start.mock.calls[0][0]).toBeLessThan(70);
    }

    // 3. cancelChime stops future chime oscillators immediately and leaves past chime unaffected
    const futureStopsBefore = futureOscs.map((osc: any) => osc.stop.mock.calls.length);
    const pastStopsBefore = pastOscs.map((osc: any) => osc.stop.mock.calls.length);

    engine.cancelChime(handleFuture);

    // Check every oscillator of that chime was stopped immediately with no arguments
    for (let i = 0; i < futureOscs.length; i++) {
      const osc = futureOscs[i];
      expect(osc.stop.mock.calls.length).toBeGreaterThan(futureStopsBefore[i]);
      expect(osc.stop.mock.calls.at(-1)).toEqual([]);
    }

    // Check past chime oscillators were NOT stopped by cancelling the future one
    for (let i = 0; i < pastOscs.length; i++) {
      const osc = pastOscs[i];
      expect(osc.stop.mock.calls.length).toBe(pastStopsBefore[i]);
    }

    dateSpy.mockRestore();
  });

  it('scheduleChime uses non-null chime buffer and starts buffer source at when', () => {
    mockCtx.currentTime = 10;
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    const mockBuffer = { duration: 2 } as AudioBuffer;
    engine.chimeBuffer = mockBuffer;

    const handle = engine.scheduleChime(15000); // (15000 - 1000) / 1000 = 14s -> when = 24
    expect(handle.when).toBe(24);

    const bufferSources = mockCtx.createBufferSource.mock.results.map((r: any) => r.value);
    const chimeSource = bufferSources.at(-1);
    expect(chimeSource).toBeDefined();
    expect(chimeSource.buffer).toBe(mockBuffer);
    expect(chimeSource.start).toHaveBeenCalledWith(24);

    const stopsBefore = chimeSource.stop.mock.calls.length;
    engine.cancelChime(handle);
    expect(chimeSource.stop.mock.calls.length).toBeGreaterThan(stopsBefore);
    expect(chimeSource.stop.mock.calls.at(-1)).toEqual([]);

    dateSpy.mockRestore();
  });

  it('scheduleChime falls back to synth wind-chime when chime buffer is null', () => {
    mockCtx.currentTime = 10;
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    engine.chimeBuffer = null;
    const oscCountBefore = mockCtx.createOscillator.mock.calls.length;

    const handle = engine.scheduleChime(15000);
    expect(handle.when).toBe(24);
    expect(mockCtx.createOscillator.mock.calls.length).toBe(oscCountBefore + 4);

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

  it('BGM skips missing tracks and starts the first present one', async () => {
    const tracks = [
      { id: 'missing_track', title: 'Missing Song', artist: 'Nobody' },
      { id: 'present_track', title: 'Present Song', artist: 'Somebody' },
    ];

    const mockBuffer = { duration: 60 } as AudioBuffer;
    vi.spyOn(mockLoader, 'loadAudioBuffer').mockImplementation(async (_ctx, id) => {
      if (id === 'present_track') return mockBuffer;
      return null;
    });

    await engine.startBgm(tracks);

    expect(engine.currentTrack()).toEqual({ title: 'Present Song', artist: 'Somebody' });

    const bufferSources = mockCtx.createBufferSource.mock.results.map((r: any) => r.value);
    const bgmSource = bufferSources.find((s: any) => s.buffer === mockBuffer);
    expect(bgmSource).toBeDefined();
    expect(bgmSource?.start).toHaveBeenCalled();
  });

  it('BGM handles all missing tracks without throwing or playing', async () => {
    const tracks = [
      { id: 'missing_1', title: 'Missing 1', artist: 'Nobody' },
      { id: 'missing_2', title: 'Missing 2', artist: 'Nobody' },
    ];

    vi.spyOn(mockLoader, 'loadAudioBuffer').mockResolvedValue(null);

    await engine.startBgm(tracks);

    expect(engine.currentTrack()).toBeNull();
  });
});
