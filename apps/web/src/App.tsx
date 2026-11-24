import React, { useState, useEffect } from 'react';
import { StorageManager, type ZoomSetting } from './engine/storage';
import { usePrefs } from './systems/StorageManager';
import {
  defaultFastTravelSystem,
  DEFAULT_LANDMARKS,
  type Landmark,
} from './systems/FastTravelSystem';
import { gameEngine } from './engine/game';
import { AudioUnlockPill } from './components/AudioUnlockPill';
import { MixerPanel } from './components/MixerPanel';
import { gameEvents } from './engine/events';
import { WardrobePanel } from './ui/WardrobePanel';

export default function App() {
  const [zoomSetting, setZoomSetting] = useState<ZoomSetting>(() =>
    StorageManager.getZoom()
  );
  const [isAutoStroll, setIsAutoStroll] = useState(false);
  const prefs = usePrefs();
  const [toast, setToast] = useState<string | null>(() =>
    defaultFastTravelSystem.getActiveToast()
  );
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

    // Subscribe to fast travel discovery toasts
    const unsubToast = defaultFastTravelSystem.subscribeToast((msg) => {
      setToast(msg);
    });

    let toastTimer: any = null;
    const unsubGameToast = gameEvents.on('toast', ({ message, durationMs = 3000 }) => {
      setToast(message);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        setToast(null);
      }, durationMs);
    });

    return () => {
      unsubInput();
      unsubToast();
      unsubGameToast();
      if (toastTimer) clearTimeout(toastTimer);
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

  const handleFastTravel = (landmarkId: string) => {
    if (gameEngine?.player) {
      gameEngine.player.teleportToLandmark(landmarkId);
    } else {
      defaultFastTravelSystem.teleportToLandmark(landmarkId);
    }
  };

  const landmarks: Landmark[] =
    gameEngine?.parsedMap?.landmarks?.length
      ? gameEngine.parsedMap.landmarks
      : defaultFastTravelSystem.landmarks?.length
        ? defaultFastTravelSystem.landmarks
        : DEFAULT_LANDMARKS;

  const handleToggleVibe = () => {
    if (gameEngine?.player) {
      gameEvents.emit('localInput', {});
      const next = gameEngine.player.action === 'vibe' ? 'idle' : 'vibe';
      gameEngine.player.action = next;
      setIsVibing(next === 'vibe');
    } else {
      setIsVibing((prev) => !prev);
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
      {toast && (
        <div
          className="hud-toast"
          role="status"
          style={{
            position: 'fixed',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1b2a1e',
            color: '#fffaeb',
            border: '1px solid #4a7c59',
            borderRadius: '4px',
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}

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

      <MixerPanel />
      <div className="hud-fast-travel" style={{ marginTop: '12px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            marginBottom: '6px',
            color: '#fffaeb',
          }}
        >
          Fast Travel
        </div>
        <div
          className="fast-travel-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxWidth: '160px',
          }}
        >
          {landmarks.map((lm) => {
            const isUnlocked = prefs.unlockedLandmarks.includes(lm.id);
            return isUnlocked ? (
              <button
                key={lm.id}
                type="button"
                className="hud-landmark-btn unlocked"
                onClick={() => handleFastTravel(lm.id)}
                aria-label={lm.label}
                style={{
                  padding: '4px 8px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  backgroundColor: '#2b3f2f',
                  color: '#fffaeb',
                  border: '1px solid #4a7c59',
                  borderRadius: '3px',
                }}
              >
                {lm.label}
              </button>
            ) : (
              <div
                key={lm.id}
                className="hud-landmark-btn locked"
                aria-label="Locked landmark"
                style={{
                  padding: '4px 8px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#888888',
                  backgroundColor: 'rgba(20, 20, 20, 0.4)',
                  border: '1px dashed #555555',
                  borderRadius: '3px',
                  userSelect: 'none',
                }}
              >
                ???
              </div>
            );
          })}
        </div>
      </div>

      {isWardrobeOpen && <WardrobePanel onClose={() => setIsWardrobeOpen(false)} />}
    </div>
  );
}
