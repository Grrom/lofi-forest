export interface SynthHandle {
  stop: () => void;
}

/**
 * Generates a brown noise AudioBuffer using a leaky integrator on white noise.
 */
export function createBrownNoiseBuffer(
  ctx: AudioContext,
  durationSec = 3
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const bufferSize = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, lastOut * 3.5));
  }
  return buffer;
}

/**
 * Synthesizes a gentle sine/triangle wind-chime at scheduled time `when`.
 */
export function synthesizeWindChime(
  ctx: AudioContext,
  destination: AudioNode,
  when: number
): SynthHandle {
  const notes = [
    { freq: 587.33, offset: 0.0, type: 'sine' as OscillatorType },      // D5
    { freq: 880.0, offset: 0.08, type: 'triangle' as OscillatorType },  // A5
    { freq: 1174.66, offset: 0.16, type: 'sine' as OscillatorType },    // D6
    { freq: 1760.0, offset: 0.25, type: 'triangle' as OscillatorType }, // A6
  ];

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (const note of notes) {
    if (typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
      break;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = note.type;
    const noteStart = when + note.offset;
    if (osc.frequency.setValueAtTime) {
      osc.frequency.setValueAtTime(note.freq, noteStart);
    }

    if (gain.gain.setValueAtTime) {
      gain.gain.setValueAtTime(0, noteStart);
      if (gain.gain.linearRampToValueAtTime) {
        gain.gain.linearRampToValueAtTime(0.12, noteStart + 0.02);
      }
      if (gain.gain.exponentialRampToValueAtTime) {
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 2.0);
      }
    }

    osc.connect(gain);
    gain.connect(destination);

    if (osc.start) {
      osc.start(noteStart);
    }
    try {
      if (osc.stop) {
        osc.stop(noteStart + 2.2);
      }
    } catch {}

    oscs.push(osc);
    gains.push(gain);
  }

  return {
    stop: () => {
      for (const osc of oscs) {
        try {
          if (osc.stop) osc.stop();
          if (osc.disconnect) osc.disconnect();
        } catch {}
      }
      for (const gain of gains) {
        try {
          if (gain.disconnect) gain.disconnect();
        } catch {}
      }
    },
  };
}

/**
 * Synthesizes a soft arpeggio for teleport SFX.
 */
export function synthesizeTeleportArpeggio(
  ctx: AudioContext,
  destination: AudioNode,
  when: number = ctx.currentTime
): SynthHandle {
  const notes = [
    { freq: 523.25, offset: 0.0 },  // C5
    { freq: 659.25, offset: 0.07 }, // E5
    { freq: 783.99, offset: 0.14 }, // G5
    { freq: 1046.50, offset: 0.21 }, // C6
  ];

  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  for (const note of notes) {
    if (typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
      break;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const noteStart = when + note.offset;
    if (osc.frequency.setValueAtTime) {
      osc.frequency.setValueAtTime(note.freq, noteStart);
    }

    if (gain.gain.setValueAtTime) {
      gain.gain.setValueAtTime(0, noteStart);
      if (gain.gain.linearRampToValueAtTime) {
        gain.gain.linearRampToValueAtTime(0.15, noteStart + 0.01);
      }
      if (gain.gain.exponentialRampToValueAtTime) {
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.25);
      }
    }

    osc.connect(gain);
    gain.connect(destination);

    if (osc.start) {
      osc.start(noteStart);
    }
    try {
      if (osc.stop) {
        osc.stop(noteStart + 0.28);
      }
    } catch {}

    oscs.push(osc);
    gains.push(gain);
  }

  return {
    stop: () => {
      for (const osc of oscs) {
        try {
          if (osc.stop) osc.stop();
          if (osc.disconnect) osc.disconnect();
        } catch {}
      }
      for (const gain of gains) {
        try {
          if (gain.disconnect) gain.disconnect();
        } catch {}
      }
    },
  };
}
