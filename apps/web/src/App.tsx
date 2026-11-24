import React, { useState, useEffect } from 'react';
import { StorageManager, type ZoomSetting } from './engine/storage';
import { gameEngine } from './engine/game';
import { gameEvents } from './engine/events';
import { WardrobePanel } from './ui/WardrobePanel';

export default function App() {
  const [zoomSetting, setZoomSetting] = useState<ZoomSetting>(() =>
    StorageManager.getZoom()
  );
  const [isAutoStroll, setIsAutoStroll] = useState(false);
  const [isVibing, setIsVibing] = useState(false);
  const [isWardrobeOpen, setIsWardrobeOpen] = useState(false);

  useEffect(() => {
    // Sync current setting on mount
    setZoomSetting(StorageManager.getZoom());

    // Sync Auto-Stroll and Vibe states on manual input
    const unsubInput = gameEvents.on('localInput', () => {
      if (gameEngine?.player) {
        setIsAutoStroll(gameEngine.player.isAutoStroll);
        setIsVibing(gameEngine.player.action === 'vibe');
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

  const handleToggleVibe = () => {
    if (gameEngine?.player) {
      const next = gameEngine.player.action === 'vibe' ? 'idle' : 'vibe';
      gameEngine.player.action = next;
      setIsVibing(next === 'vibe');
      gameEvents.emit('localInput', {});
    } else {
      setIsVibing((prev) => !prev);
    }
  };

  return (
    <div className="hud">
      <h1>lofi-forest</h1>
      <div className="hud-controls" style={{ marginTop: '8px' }}>
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
        <button
          type="button"
          className="hud-vibe-btn"
          onClick={handleToggleVibe}
          aria-label="Toggle Vibe"
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: isVibing ? '#8b5cf6' : undefined,
            color: isVibing ? '#ffffff' : undefined,
          }}
        >
          Vibe: {isVibing ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className="hud-wardrobe-btn"
          onClick={() => setIsWardrobeOpen((prev) => !prev)}
          aria-label="Toggle Wardrobe"
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: isWardrobeOpen ? '#b58351' : undefined,
            color: isWardrobeOpen ? '#ffffff' : undefined,
          }}
        >
          Wardrobe
        </button>
      </div>
      {isWardrobeOpen && <WardrobePanel onClose={() => setIsWardrobeOpen(false)} />}
    </div>
  );
}
