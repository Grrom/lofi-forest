import type { ZoneId } from '@lofi/shared';
import { StorageManager, type VolumePrefs } from '../systems/StorageManager';
import { gameEvents } from '../engine/events';
import { assetLoader, type AssetLoader } from '../engine/assets/AssetLoader';
import { zoneMix, type AmbientChannel } from './zoneMix';
import {
  createBrownNoiseBuffer,
  synthesizeWindChime,
  synthesizeTeleportArpeggio,
  type SynthHandle,
} from './synths';

export type MixerChannel = 'master' | 'music' | 'rain' | 'campfire' | 'ambience';

export interface BgmTrack {
  id: string;
  title: string;
  artist: string;
  src?: string;
}

export interface ChimeHandle {
  id: number;
  when: number;
  stop: () => void;
}

let nextChimeId = 1;

export class AudioEngine {
  public ctx: AudioContext | null = null;
  private _unlocked = false;
  private unlockListeners = new Set<() => void>();

  // 5 mixer channels: master, music, rain, campfire, ambience
  public channels!: Record<MixerChannel, GainNode>;
  // 4 zone mix ambient channels: forest, campfire, rain, pub
  public zoneGains!: Record<AmbientChannel, GainNode>;
  public rainFilter!: BiquadFilterNode;

  // Active sources
  private ambientSources = new Map<AmbientChannel, AudioBufferSourceNode>();
  private isRainNoise = false;
  private currentZoneId: ZoneId = 'forest';

  // BGM Queue
  private bgmQueue: BgmTrack[] = [];
  private currentBgmIndex = -1;
  private currentBgmSource: AudioBufferSourceNode | null = null;
  private currentBgmGain: GainNode | null = null;
  private bgmTimer: any = null;
  private trackChangeListeners = new Set<(track: { title: string; artist: string } | null) => void>();

  // Scheduled chimes
  private activeChimes = new Map<number, ChimeHandle>();

  // Listeners teardown
  private unsubStorage: (() => void) | null = null;
  private unsubZone: (() => void) | null = null;
  private unsubTeleport: (() => void) | null = null;
  private gestureListenersAttached = false;
  private customAssetLoader: AssetLoader;

  constructor(providedCtx?: AudioContext, loader: AssetLoader = assetLoader) {
    this.customAssetLoader = loader;

    if (providedCtx) {
      this.initGraph(providedCtx);
    }

    this.attachGestureListeners();
    this.subscribeEvents();
  }

  public getContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtxClass =
        typeof window !== 'undefined'
          ? window.AudioContext || (window as any).webkitAudioContext
          : null;
      if (AudioCtxClass) {
        try {
          this.initGraph(new AudioCtxClass());
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }
    return this.ctx;
  }

  public init(ctx?: AudioContext): void {
    if (ctx) {
      this.initGraph(ctx);
    } else {
      this.getContext();
    }
  }

  private initGraph(ctx: AudioContext): void {
    this.ctx = ctx;

    // 1. Master gain
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // 2. 4 mixer sub-channels -> master
    const musicGain = ctx.createGain();
    musicGain.connect(masterGain);

    const rainMixerGain = ctx.createGain();
    rainMixerGain.connect(masterGain);

    const campfireMixerGain = ctx.createGain();
    campfireMixerGain.connect(masterGain);

    const ambienceMixerGain = ctx.createGain();
    ambienceMixerGain.connect(masterGain);

    this.channels = {
      master: masterGain,
      music: musicGain,
      rain: rainMixerGain,
      campfire: campfireMixerGain,
      ambience: ambienceMixerGain,
    };

    // Initialize mixer gains from StorageManager
    const initialVols = StorageManager.get().volumes;
    masterGain.gain.value = initialVols.master;
    musicGain.gain.value = initialVols.music;
    rainMixerGain.gain.value = initialVols.rain;
    campfireMixerGain.gain.value = initialVols.campfire;
    ambienceMixerGain.gain.value = initialVols.ambience;

    // 3. Zone ambient gain nodes
    const forestGain = ctx.createGain();
    forestGain.connect(ambienceMixerGain);

    const pubGain = ctx.createGain();
    pubGain.connect(ambienceMixerGain);

    const campfireZoneGain = ctx.createGain();
    campfireZoneGain.connect(campfireMixerGain);

    // Rain low-pass filter (900 Hz in pub, 20000 Hz otherwise)
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 20000;

    const rainZoneGain = ctx.createGain();
    rainZoneGain.connect(rainFilter);
    rainFilter.connect(rainMixerGain);

    this.rainFilter = rainFilter;

    this.zoneGains = {
      forest: forestGain,
      campfire: campfireZoneGain,
      rain: rainZoneGain,
      pub: pubGain,
    };

    // Apply initial zone mix
    const initMix = zoneMix(this.currentZoneId);
    forestGain.gain.value = initMix.forest;
    campfireZoneGain.gain.value = initMix.campfire;
    rainZoneGain.gain.value = initMix.rain;
    pubGain.gain.value = initMix.pub;
    rainFilter.frequency.value = initMix.rainFilterCutoff;

    // If context was passed in already running
    if (ctx.state === 'running') {
      this._unlocked = true;
    }
  }

  public isUnlocked(): boolean {
    return this._unlocked || this.ctx?.state === 'running';
  }

  public onUnlock(cb: () => void): () => void {
    this.unlockListeners.add(cb);
    return () => {
      this.unlockListeners.delete(cb);
    };
  }

  private notifyUnlock(): void {
    for (const cb of Array.from(this.unlockListeners)) {
      try {
        cb();
      } catch (err) {
        console.error('[AudioEngine] unlock listener error:', err);
      }
    }
  }

  private attachGestureListeners(): void {
    if (typeof window === 'undefined' || this.gestureListenersAttached) return;
    this.gestureListenersAttached = true;

    const handleGesture = () => {
      this.unlock();
    };

    window.addEventListener('pointerdown', handleGesture, { capture: true });
    window.addEventListener('keydown', handleGesture, { capture: true });
    (this as any)._removeGestures = () => {
      window.removeEventListener('pointerdown', handleGesture, { capture: true });
      window.removeEventListener('keydown', handleGesture, { capture: true });
      this.gestureListenersAttached = false;
    };
  }

  private removeGestureListeners(): void {
    if ((this as any)._removeGestures) {
      (this as any)._removeGestures();
      (this as any)._removeGestures = null;
    }
  }

  public async unlock(): Promise<boolean> {
    if (this.isUnlocked()) return true;

    try {
      const ctx = this.getContext();
      if (ctx && ctx.state === 'suspended' && ctx.resume) {
        await ctx.resume();
      }
      this._unlocked = true;
      this.removeGestureListeners();
      this.notifyUnlock();
      this.startAmbientAndBgm();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Tries to resume() without a gesture (for OBS / headless).
   */
  public async unlockNow(): Promise<boolean> {
    try {
      const ctx = this.getContext();
      if (ctx && ctx.resume) {
        await ctx.resume();
      }
      if (this.ctx?.state === 'running') {
        this._unlocked = true;
        this.removeGestureListeners();
        this.notifyUnlock();
        this.startAmbientAndBgm();
        return true;
      }
    } catch {
      // Resume failed
    }
    return false;
  }

  private subscribeEvents(): void {
    this.unsubStorage = StorageManager.subscribe((prefs) => {
      this.applyVolumePrefs(prefs.volumes);
    });

    this.unsubZone = gameEvents.on('zoneChanged', ({ zone }) => {
      this.setZone(zone);
    });

    this.unsubTeleport = gameEvents.on('teleported', () => {
      this.playSfx('teleport');
    });
  }

  public setVolume(channel: MixerChannel, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (!this.ctx || !this.channels) return;
    const gainNode = this.channels[channel];
    if (gainNode) {
      const now = this.ctx.currentTime;
      if (gainNode.gain.cancelScheduledValues) {
        gainNode.gain.cancelScheduledValues(now);
      }
      if (gainNode.gain.setValueAtTime) {
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      }
      if (gainNode.gain.linearRampToValueAtTime) {
        gainNode.gain.linearRampToValueAtTime(clamped, now + 0.05); // 50 ms ramp
      } else {
        gainNode.gain.value = clamped;
      }
    }
  }

  private applyVolumePrefs(volumes: VolumePrefs): void {
    const keys: MixerChannel[] = ['master', 'music', 'rain', 'campfire', 'ambience'];
    for (const key of keys) {
      this.setVolume(key, volumes[key]);
    }
  }

  /**
   * On zoneChanged, ramp each ambience channel gain with linearRampToValueAtTime over 1.5 s.
   */
  public setZone(zone: ZoneId): void {
    this.currentZoneId = zone;
    if (!this.ctx || !this.zoneGains) return;

    const mix = zoneMix(zone);
    const now = this.ctx.currentTime;
    const rampEnd = now + 1.5;

    const targets: [AmbientChannel, number][] = [
      ['forest', mix.forest],
      ['campfire', mix.campfire],
      ['rain', mix.rain],
      ['pub', mix.pub],
    ];

    for (const [ch, target] of targets) {
      const gainNode = this.zoneGains[ch];
      if (gainNode) {
        if (gainNode.gain.cancelScheduledValues) {
          gainNode.gain.cancelScheduledValues(now);
        }
        if (gainNode.gain.setValueAtTime) {
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        }
        if (gainNode.gain.linearRampToValueAtTime) {
          gainNode.gain.linearRampToValueAtTime(target, rampEnd);
        } else {
          gainNode.gain.value = target;
        }
      }
    }

    if (this.rainFilter) {
      const targetFreq = mix.rainFilterCutoff;
      if (this.rainFilter.frequency.cancelScheduledValues) {
        this.rainFilter.frequency.cancelScheduledValues(now);
      }
      if (this.rainFilter.frequency.setValueAtTime) {
        this.rainFilter.frequency.setValueAtTime(this.rainFilter.frequency.value, now);
      }
      if (this.rainFilter.frequency.linearRampToValueAtTime) {
        this.rainFilter.frequency.linearRampToValueAtTime(targetFreq, rampEnd);
      } else {
        this.rainFilter.frequency.value = targetFreq;
      }
    }
  }

  /**
   * Ambience loops: rain, campfire, forest, pub.
   * Null buffer fallbacks:
   * - rain: brown noise
   * - others: stay silent
   */
  public async startAmbience(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    const channels: AmbientChannel[] = ['rain', 'campfire', 'forest', 'pub'];

    for (const ch of channels) {
      if (this.ambientSources.has(ch)) continue;

      let buffer: AudioBuffer | null = null;
      try {
        buffer = await this.customAssetLoader.loadAudioBuffer(ctx, ch);
      } catch {
        buffer = null;
      }

      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.zoneGains[ch]);
        source.start(0);
        this.ambientSources.set(ch, source);
      } else if (ch === 'rain') {
        // Rain fallback: brown noise
        const noiseBuffer = createBrownNoiseBuffer(ctx);
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;
        source.connect(this.zoneGains[ch]);
        source.start(0);
        this.ambientSources.set(ch, source);
        this.isRainNoise = true;
      }
      // campfire, forest, pub with null buffer stay silent
    }
  }

  public getRainSource(): AudioBufferSourceNode | undefined {
    return this.ambientSources.get('rain');
  }

  public isRainNoiseSource(): boolean {
    return this.isRainNoise;
  }

  /**
   * BGM Queue with 3 s crossfade looping the list.
   */
  public currentTrack(): { title: string; artist: string } | null {
    if (this.currentBgmIndex >= 0 && this.currentBgmIndex < this.bgmQueue.length) {
      const track = this.bgmQueue[this.currentBgmIndex];
      return { title: track.title, artist: track.artist };
    }
    return null;
  }

  public onTrackChange(
    cb: (track: { title: string; artist: string } | null) => void
  ): () => void {
    this.trackChangeListeners.add(cb);
    return () => {
      this.trackChangeListeners.delete(cb);
    };
  }

  private notifyTrackChange(): void {
    const track = this.currentTrack();
    for (const cb of Array.from(this.trackChangeListeners)) {
      try {
        cb(track);
      } catch (err) {
        console.error('[AudioEngine] trackChange error:', err);
      }
    }
  }

  public async startBgm(queue?: BgmTrack[]): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    if (queue) {
      this.bgmQueue = queue;
    } else {
      let manifest = this.customAssetLoader.getManifest();
      if (!manifest) {
        manifest = await this.customAssetLoader.loadManifest().catch(() => null);
      }
      this.bgmQueue = (manifest?.audio?.bgm as BgmTrack[]) || [];
    }

    if (this.bgmQueue.length === 0) return;
    this.playNextBgm(0);
  }

  private async playNextBgm(index: number): Promise<void> {
    const ctx = this.getContext();
    if (!ctx || this.bgmQueue.length === 0) return;

    this.currentBgmIndex = index % this.bgmQueue.length;
    const track = this.bgmQueue[this.currentBgmIndex];
    this.notifyTrackChange();

    let buffer: AudioBuffer | null = null;
    try {
      buffer = await this.customAssetLoader.loadAudioBuffer(ctx, track.id);
    } catch {
      buffer = null;
    }

    if (!buffer) {
      // Missing BGM stays silent
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(this.channels.music);

    const now = ctx.currentTime;
    const duration = buffer.duration || 60;
    const fadeSec = Math.min(3.0, duration / 2);

    // Fade in
    if (gain.gain.setValueAtTime) {
      gain.gain.setValueAtTime(0, now);
      if (gain.gain.linearRampToValueAtTime) {
        gain.gain.linearRampToValueAtTime(1, now + fadeSec);
      }
    }
    source.start(now);

    // Fade out previous
    if (this.currentBgmGain && this.currentBgmSource) {
      const prevGain = this.currentBgmGain;
      const prevSource = this.currentBgmSource;
      if (prevGain.gain.setValueAtTime) {
        prevGain.gain.setValueAtTime(prevGain.gain.value, now);
        if (prevGain.gain.linearRampToValueAtTime) {
          prevGain.gain.linearRampToValueAtTime(0, now + fadeSec);
        }
      }
      try {
        prevSource.stop(now + fadeSec);
      } catch {}
    }

    this.currentBgmSource = source;
    this.currentBgmGain = gain;

    // Schedule next track crossfade at (now + duration - fadeSec)
    const playNextAtMs = Math.max(100, (duration - fadeSec) * 1000);
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
    }
    this.bgmTimer = setTimeout(() => {
      this.playNextBgm(this.currentBgmIndex + 1);
    }, playNextAtMs);
  }

  private startAmbientAndBgm(): void {
    this.startAmbience().catch((err) => console.warn('Ambience start error:', err));
    this.startBgm().catch((err) => console.warn('BGM start error:', err));
  }

  /**
   * Scheduled chime:
   * computes when = ctx.currentTime + max(0, (atMs - Date.now())/1000), so it plays even in hidden tabs.
   */
  public scheduleChime(atMs: number): ChimeHandle {
    const ctx = this.getContext();
    const id = nextChimeId++;
    if (!ctx) {
      return { id, when: atMs, stop: () => {} };
    }

    const delaySec = Math.max(0, (atMs - Date.now()) / 1000);
    const when = ctx.currentTime + delaySec;

    let stopped = false;
    let sourceNode: AudioBufferSourceNode | null = null;
    let synthHandle: SynthHandle | null = null;

    if (typeof ctx.createOscillator === 'function') {
      // Synth fallback: gentle sine/triangle wind-chime
      synthHandle = synthesizeWindChime(ctx, this.channels?.master ?? ctx.destination, when);
    } else if (typeof ctx.createBufferSource === 'function') {
      sourceNode = ctx.createBufferSource();
      sourceNode.connect(this.channels?.master ?? ctx.destination);
      if (sourceNode.start) {
        sourceNode.start(when);
      }
    }

    const handle: ChimeHandle = {
      id,
      when,
      stop: () => {
        if (stopped) return;
        stopped = true;
        if (synthHandle) {
          synthHandle.stop();
        }
        if (sourceNode) {
          try {
            if (sourceNode.stop) sourceNode.stop();
            if (sourceNode.disconnect) sourceNode.disconnect();
          } catch {}
        }
        this.activeChimes.delete(id);
      },
    };

    this.activeChimes.set(id, handle);
    return handle;
  }

  public cancelChime(handle: ChimeHandle | number): void {
    if (typeof handle === 'number') {
      const active = this.activeChimes.get(handle);
      active?.stop();
    } else if (handle && typeof handle.stop === 'function') {
      handle.stop();
    }
  }

  /**
   * SFX playback (teleport, pomo_chime).
   */
  public async playSfx(name: 'teleport' | 'pomo_chime'): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;

    let buffer: AudioBuffer | null = null;
    try {
      buffer = await this.customAssetLoader.loadAudioBuffer(ctx, name);
    } catch {
      buffer = null;
    }

    const dest = this.channels?.master ?? ctx.destination;

    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(dest);
      source.start(0);
    } else if (name === 'teleport') {
      // Soft arpeggio synth fallback
      synthesizeTeleportArpeggio(ctx, dest);
    } else if (name === 'pomo_chime') {
      synthesizeWindChime(ctx, dest, ctx.currentTime);
    }
  }

  public destroy(): void {
    this.removeGestureListeners();
    if (this.unsubStorage) this.unsubStorage();
    if (this.unsubZone) this.unsubZone();
    if (this.unsubTeleport) this.unsubTeleport();
    if (this.bgmTimer) clearTimeout(this.bgmTimer);

    for (const chime of this.activeChimes.values()) {
      chime.stop();
    }
    this.activeChimes.clear();

    for (const src of this.ambientSources.values()) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    this.ambientSources.clear();

    if (this.currentBgmSource) {
      try {
        this.currentBgmSource.stop();
        this.currentBgmSource.disconnect();
      } catch {}
    }
  }
}

export const audioEngine = new AudioEngine();
