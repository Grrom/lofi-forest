import React, { useState, useEffect } from 'react';
import { StorageManager, usePrefs, type VolumePrefs } from '../systems/StorageManager';
import { audioEngine, AudioEngine, type MixerChannel } from '../audio/AudioEngine';

interface MixerPanelProps {
  engine?: AudioEngine;
}

const CHANNEL_LABELS: Record<MixerChannel, string> = {
  master: 'Master',
  music: 'Music',
  rain: 'Rain',
  campfire: 'Campfire',
  ambience: 'Ambience',
};

const CHANNELS: MixerChannel[] = ['master', 'music', 'rain', 'campfire', 'ambience'];

export const MixerPanel: React.FC<MixerPanelProps> = ({ engine = audioEngine }) => {
  const prefs = usePrefs();
  const volumes = prefs.volumes;
  const [currentTrack, setCurrentTrack] = useState<{ title: string; artist: string } | null>(
    () => engine.currentTrack()
  );

  useEffect(() => {
    setCurrentTrack(engine.currentTrack());
    const unsub = engine.onTrackChange((track) => {
      setCurrentTrack(track);
    });
    return unsub;
  }, [engine]);

  const handleSliderChange = (channel: MixerChannel, value: number) => {
    // 1. Persist in StorageManager
    StorageManager.update((prev) => ({
      volumes: {
        ...prev.volumes,
        [channel]: value,
      },
    }));

    // 2. Apply via engine with 50 ms ramp
    engine.setVolume(channel, value);
  };

  return (
    <div
      className="hud-mixer-panel"
      style={{
        backgroundColor: 'rgba(20, 25, 20, 0.85)',
        border: '1px solid #334433',
        borderRadius: '8px',
        padding: '10px 14px',
        color: '#e0eee0',
        fontFamily: 'monospace',
        fontSize: '12px',
        maxWidth: '240px',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #334433', paddingBottom: '4px' }}>
        Audio Mixer
      </div>

      {currentTrack && (
        <div style={{ fontSize: '11px', color: '#90c090', marginBottom: '8px' }}>
          ♫ {currentTrack.title} - {currentTrack.artist}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {CHANNELS.map((ch) => {
          const val = volumes[ch] ?? 0.5;
          const label = CHANNEL_LABELS[ch];
          return (
            <div key={ch} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <label htmlFor={`slider-${ch}`} style={{ width: '65px', fontSize: '11px' }}>
                {label}
              </label>
              <input
                id={`slider-${ch}`}
                type="range"
                aria-label={`${label} Volume`}
                min="0"
                max="1"
                step="0.01"
                value={val}
                onChange={(e) => handleSliderChange(ch, parseFloat(e.target.value))}
                style={{ width: '110px', cursor: 'pointer' }}
              />
              <span style={{ width: '32px', textAlign: 'right', fontSize: '10px' }}>
                {Math.round(val * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MixerPanel;
