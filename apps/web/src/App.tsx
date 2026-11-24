import React, { useState, useEffect } from 'react';
import { StorageManager, type ZoomSetting } from './engine/storage';
import { gameEngine } from './engine/game';
import { AudioUnlockPill } from './components/AudioUnlockPill';
import { MixerPanel } from './components/MixerPanel';
import { gameEvents } from './engine/events';

export default function App() {
  const [zoomSetting, setZoomSetting] = useState<ZoomSetting>(() =>
    StorageManager.getZoom()
  );
  const [isAutoStroll, setIsAutoStroll] = useState(false);

  useEffect(() => {
    // Sync current setting on mount
    setZoomSetting(StorageManager.getZoom());

    // Sync Auto-Stroll state on manual input (manual input turns it off)
    const unsubInput = gameEvents.on('localInput', () => {
      if (gameEngine?.player) {
        setIsAutoStroll(gameEngine.player.isAutoStroll);
      } else {
        setIsAutoStroll(false);
      }
    });

    return () => {
      unsubInput();
    };
  }, []);

  const handleCycleZoom = () => {
    let next: ZoomSetting;
    if (gameEngine?.camera) {
      next = gameEngine.camera.cycleZoom();
    } else {
      const order: ZoomSetting[] = ['auto', 2, 3, 4];
      const idx = order.indexOf(zoomSetting);
      next = order[(idx + 1) % order.length];
      StorageManager.setZoom(next);
    }
    setZoomSetting(next);
  };

  const handleToggleAutoStroll = () => {
    if (gameEngine?.player) {
      const next = !gameEngine.player.isAutoStroll;
      gameEngine.player.setAutoStroll(next);
      setIsAutoStroll(next);
    } else {
      setIsAutoStroll((prev) => !prev);
    }
  };

  return (
    <div
      className="hud"
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '18px', color: '#e0eee0', fontFamily: 'monospace' }}>
          lofi-forest
        </h1>
        <AudioUnlockPill />
      </div>

      <div className="hud-controls" style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="hud-zoom-btn"
          onClick={handleCycleZoom}
          aria-label="Toggle Camera Zoom"
          style={{
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: 'rgba(20, 25, 20, 0.85)',
            color: '#e0eee0',
            border: '1px solid #334433',
            borderRadius: '4px',
          }}
        >
          Zoom: {zoomSetting}
        </button>
        <button
          type="button"
          className="hud-stroll-btn"
          onClick={handleToggleAutoStroll}
          aria-label="Toggle Auto-Stroll"
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: isAutoStroll ? '#4a7c59' : undefined,
            color: isAutoStroll ? '#ffffff' : undefined,
          }}
        >
          Auto-Stroll: {isAutoStroll ? 'ON' : 'OFF'}
        </button>
      </div>

      <MixerPanel />
    </div>
  );
}
