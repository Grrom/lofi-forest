import React, { useState, useEffect } from 'react';
import { StorageManager, type ZoomSetting } from './engine/storage';
import { gameEngine } from './engine/game';
import { AudioUnlockPill } from './components/AudioUnlockPill';
import { MixerPanel } from './components/MixerPanel';

export default function App() {
  const [zoomSetting, setZoomSetting] = useState<ZoomSetting>(() =>
    StorageManager.getZoom()
  );

  useEffect(() => {
    // Sync current setting on mount
    setZoomSetting(StorageManager.getZoom());
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
      </div>

      <MixerPanel />
    </div>
  );
}
