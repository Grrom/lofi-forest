import { vi } from 'vitest';

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
