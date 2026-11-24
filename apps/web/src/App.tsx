import React, { useState, useEffect, useMemo } from 'react';
import { parseSpectatorParams } from '@lofi/shared';
import { StreamOverlay } from './components/StreamOverlay';
import {
  usePrefs,
  StorageManager,
  type ZoomSetting,
} from './systems/StorageManager';
import {
  defaultFastTravelSystem,
  DEFAULT_LANDMARKS,
  type Landmark,
} from './systems/FastTravelSystem';
import { gameEngine } from './engine/game';
import { AudioUnlockPill } from './components/AudioUnlockPill';
import { StatusPill } from './components/StatusPill';
import { MixerPanel } from './components/MixerPanel';
import { gameEvents } from './engine/events';
import { WardrobePanel } from './ui/WardrobePanel';
import { EmoteBar } from './components/EmoteBar';
import { PomoCard } from './components/PomoCard';
import { RosterPanel } from './components/RosterPanel';
import { createTransport, parseRoomParam } from './net/createTransport';
import type { TransportStatus } from './net/TransportAdapter';
import { PUBLIC_ROOM_CODE } from '@lofi/shared';

export default function App({ search }: { search?: string } = {}) {
  const spectatorParams = useMemo(() => {
    const s =
      search !== undefined
        ? search
        : typeof window !== 'undefined'
          ? window.location?.search
          : '';
    return parseSpectatorParams(s);
  }, [search]);

  const [isOverlayVisible, setIsOverlayVisible] = useState(
    spectatorParams.overlay
  );
  const [isAutoStroll, setIsAutoStroll] = useState(false);
  const prefs = usePrefs();
  const [toast, setToast] = useState<string | null>(() =>
    defaultFastTravelSystem.getActiveToast()
  );
  const [isVibing, setIsVibing] = useState(false);
  const [isWardrobeOpen, setIsWardrobeOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<TransportStatus>('connected');
  const [assignedName, setAssignedName] = useState<string | null>(
    () => (gameEngine?.transport as any)?.assignedName ?? null
  );
  const [isPublic, setIsPublic] = useState<boolean>(() => {
    return (
      parseRoomParam() === PUBLIC_ROOM_CODE ||
      gameEngine?.transport?.mode === 'public'
    );
  });

  useEffect(() => {
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

    const unsubStatus = gameEvents.on('connectionStatusChanged', ({ status }) => {
      setConnectionStatus(status);
    });

    const unsubToggleOverlay = gameEvents.on('toggleOverlay', () => {
      setIsOverlayVisible((prev) => !prev);
    });

    const unsubAssigned = gameEvents.on('assignedNameChanged', ({ name }) => {
      setAssignedName(name);
      setIsPublic(true);
    });

    return () => {
      unsubInput();
      unsubToast();
      unsubGameToast();
      unsubStatus();
      unsubToggleOverlay();
      unsubAssigned();
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  const handleJoinPublicLobby = async () => {
    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', 'public');
      window.history.pushState({}, '', url.toString());
    }
    if (gameEngine?.connectPublicLobby) {
      await gameEngine.connectPublicLobby();
    } else {
      const transport = createTransport('?room=public');
      await transport.connect();
    }
  };

  const handleTryAgain = async () => {
    if (gameEngine?.transport) {
      await gameEngine.transport.connect();
    }
    gameEvents.emit('retryConnection', {});
  };

  const handleCycleZoom = () => {
    if (gameEngine?.camera) {
      gameEngine.camera.cycleZoom();
    } else {
      const order: ZoomSetting[] = ['auto', 2, 3, 4];
      const idx = order.indexOf(prefs.zoom);
      const next = order[(idx + 1) % order.length];
      StorageManager.update({ zoom: next });
    }
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
  if (spectatorParams.spectator) {
    return isOverlayVisible ? (
      <StreamOverlay
        focusMin={spectatorParams.focusMin}
        breakMin={spectatorParams.breakMin}
      />
    ) : null;
  }

  return (
    <>
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
        <StatusPill />
        {isPublic && assignedName && (
          <div
            className="hud-player-name"
            aria-label={`Player Name: ${assignedName}`}
            style={{
              padding: '3px 8px',
              backgroundColor: '#1b2a1e',
              border: '1px solid #4a7c59',
              borderRadius: '12px',
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#fffaeb',
              fontWeight: 'bold',
            }}
          >
            {assignedName}
          </div>
        )}
        {connectionStatus === 'room_full' && (
          <button
            type="button"
            className="hud-try-again-btn"
            onClick={handleTryAgain}
            aria-label="Try again"
            style={{
              padding: '3px 8px',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: '#782d2d',
              color: '#ffffff',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              fontWeight: 'bold',
            }}
          >
            Try again
          </button>
        )}
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
          Zoom: {prefs.zoom}
        </button>
        <button
          type="button"
          className="hud-public-btn"
          onClick={handleJoinPublicLobby}
          aria-label="Join Public Lobby"
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            backgroundColor: '#2b3f2f',
            color: '#fffaeb',
            border: '1px solid #4a7c59',
            borderRadius: '4px',
          }}
        >
          Join Public Lobby
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
      <PomoCard />
      <RosterPanel />
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
      {isWardrobeOpen && (
        <WardrobePanel
          isLobby={isPublic}
          serverName={assignedName}
          onClose={() => setIsWardrobeOpen(false)}
        />
      )}
    </div>
    <EmoteBar />
    </>
  );
}
