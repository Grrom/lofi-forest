import React, { useState, useEffect } from 'react';
import { epochCycle } from '@lofi/shared';
import { formatTimerMs } from '../systems/PomodoroController';
import { audioEngine } from '../audio/AudioEngine';

export interface StreamOverlayProps {
  focusMin?: number;
  breakMin?: number;
  now?: () => number;
  audio?: {
    currentTrack: () => { title: string; artist: string } | null;
    onTrackChange?: (
      cb: (track: { title: string; artist: string } | null) => void
    ) => () => void;
  };
  siteHost?: string;
  className?: string;
}

export function getSiteHost(): string {
  const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const siteUrl = metaEnv?.VITE_SITE_URL as string | undefined;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl.includes('://') ? siteUrl : `http://${siteUrl}`);
      return parsed.host;
    } catch {
      return siteUrl.replace(/^https?:\/\//, '').split('/')[0];
    }
  }
  if (typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return 'localhost';
}

export const StreamOverlay: React.FC<StreamOverlayProps> = ({
  focusMin = 50,
  breakMin = 10,
  now = () => Date.now(),
  audio = audioEngine,
  siteHost = getSiteHost(),
  className,
}) => {
  const [nowMs, setNowMs] = useState(now);
  const [track, setTrack] = useState(() => audio.currentTrack());

  useEffect(() => {
    const unsubTrack = audio.onTrackChange?.((t) => {
      setTrack(t);
    });

    const interval = setInterval(() => {
      setNowMs(now());
      setTrack(audio.currentTrack());
    }, 250);

    return () => {
      clearInterval(interval);
      unsubTrack?.();
    };
  }, [now, audio]);

  const cycle = epochCycle(nowMs, focusMin, breakMin);
  const remainingMs = Math.max(0, cycle.endsAtMs - nowMs);
  const countdownStr = formatTimerMs(remainingMs);
  const phaseStr = cycle.phase.toUpperCase();

  return (
    <div
      className={`stream-overlay-card hud-overlay-card ${className ?? ''}`}
      role="complementary"
      aria-label="Stream Overlay"
      style={{
        position: 'fixed',
        top: '16px',
        left: '16px',
        backgroundColor: 'rgba(20, 25, 20, 0.9)',
        border: '2px solid #334433',
        borderRadius: '6px',
        padding: '12px 16px',
        color: '#e0eee0',
        fontFamily: 'monospace',
        minWidth: '220px',
        maxWidth: '320px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        className="stream-overlay-timer"
        style={{
          fontSize: '22px',
          fontWeight: 'bold',
          letterSpacing: '1px',
          color: cycle.phase === 'focus' ? '#4ade80' : '#f59e0b',
          marginBottom: '6px',
        }}
      >
        {phaseStr} {countdownStr}
      </div>

      {track && (
        <div
          className="stream-overlay-track"
          style={{
            fontSize: '12px',
            color: '#fffaeb',
            marginBottom: '8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          ♪ {track.title} {track.artist ? `– ${track.artist}` : ''}
        </div>
      )}

      <div
        className="stream-overlay-footer"
        style={{
          fontSize: '11px',
          color: '#8fa88f',
          borderTop: '1px solid #334433',
          paddingTop: '6px',
        }}
      >
        Join this world in your browser: {siteHost}
      </div>
    </div>
  );
};
