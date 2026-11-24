import React, { useState, useEffect } from 'react';
import { audioEngine, AudioEngine } from '../audio/AudioEngine';

interface AudioUnlockPillProps {
  engine?: AudioEngine;
}

export const AudioUnlockPill: React.FC<AudioUnlockPillProps> = ({ engine = audioEngine }) => {
  const [unlocked, setUnlocked] = useState(() => engine.isUnlocked());

  useEffect(() => {
    if (engine.isUnlocked()) {
      setUnlocked(true);
      return;
    }
    const unsub = engine.onUnlock(() => {
      setUnlocked(true);
    });
    return unsub;
  }, [engine]);

  if (unlocked) {
    return null;
  }

  return (
    <button
      type="button"
      className="audio-unlock-pill"
      onClick={() => engine.unlock()}
      style={{
        padding: '6px 14px',
        backgroundColor: '#4a7c59',
        color: '#ffffff',
        border: '1px solid #31583d',
        borderRadius: '16px',
        fontFamily: 'monospace',
        fontSize: '13px',
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }}
    >
      Click to enable sound
    </button>
  );
};

export default AudioUnlockPill;
