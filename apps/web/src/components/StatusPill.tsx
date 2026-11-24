import React, { useState, useEffect } from 'react';
import type { TransportStatus } from '../net/TransportAdapter';
import { gameEvents } from '../engine/events';

export interface StatusPillProps {
  status?: TransportStatus;
}

const STATUS_LABELS: Record<TransportStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
  disconnected: 'Disconnected',
  room_full: 'Room Full',
};

const STATUS_COLORS: Record<TransportStatus, { bg: string; border: string; dot: string }> = {
  connected: { bg: '#1c2e20', border: '#4a7c59', dot: '#22c55e' },
  connecting: { bg: '#2d2a14', border: '#786e2d', dot: '#eab308' },
  reconnecting: { bg: '#2d2214', border: '#78532d', dot: '#f97316' },
  disconnected: { bg: '#2d1414', border: '#782d2d', dot: '#ef4444' },
  room_full: { bg: '#2d1414', border: '#782d2d', dot: '#ef4444' },
};

export const StatusPill: React.FC<StatusPillProps> = ({ status: propStatus }) => {
  const [status, setStatus] = useState<TransportStatus>(() => propStatus ?? 'connected');

  useEffect(() => {
    if (propStatus !== undefined) {
      setStatus(propStatus);
      return;
    }

    const unsub = gameEvents.on('connectionStatusChanged', ({ status: s }) => {
      setStatus(s);
    });
    return unsub;
  }, [propStatus]);

  const colors = STATUS_COLORS[status] || STATUS_COLORS.connected;
  const label = STATUS_LABELS[status] || status;

  return (
    <div
      className={`hud-status-pill status-${status}`}
      aria-label={`Connection Status: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#fffaeb',
        fontWeight: 'bold',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: colors.dot,
        }}
      />
      <span>{label}</span>
    </div>
  );
};

export default StatusPill;
