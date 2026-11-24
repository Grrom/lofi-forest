import React, { useState, useEffect } from 'react';
import type { PlayerNetState } from '@lofi/shared';
import { gameEvents } from '../engine/events';
import { gameEngine } from '../engine/game';

export interface RosterPanelProps {
  players?: PlayerNetState[] | Map<string, PlayerNetState>;
  teleportNear?: (x: number, y: number) => void;
  onTeleportNear?: (x: number, y: number) => void;
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  players: propPlayers,
  teleportNear,
  onTeleportNear,
}) => {
  const [eventPlayers, setEventPlayers] = useState<Map<string, PlayerNetState>>(() => new Map());

  useEffect(() => {
    if (propPlayers !== undefined) return;
    const unsub = gameEvents.on('playersChanged', ({ players }) => {
      setEventPlayers(new Map(players));
    });
    return unsub;
  }, [propPlayers]);

  const playerList: PlayerNetState[] =
    propPlayers !== undefined
      ? Array.isArray(propPlayers)
        ? propPlayers
        : Array.from(propPlayers.values())
      : Array.from(eventPlayers.values());

  const handlePlayerClick = (p: PlayerNetState) => {
    if (teleportNear) {
      teleportNear(p.x, p.y);
    } else if (onTeleportNear) {
      onTeleportNear(p.x, p.y);
    } else if (gameEngine?.player?.teleportNear) {
      gameEngine.player.teleportNear(p.x, p.y);
    }
  };

  return (
    <div
      className="hud-roster-panel"
      role="region"
      aria-label="Player Roster"
      style={{
        marginTop: '10px',
        backgroundColor: 'rgba(20, 25, 20, 0.85)',
        border: '1px solid #334433',
        borderRadius: '4px',
        padding: '8px',
        maxWidth: '180px',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e0eee0',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '12px' }}>
        Players ({playerList.length})
      </div>
      {playerList.length === 0 ? (
        <div style={{ color: '#888888', fontSize: '11px' }}>No players nearby</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {playerList.map((p) => (
            <button
              key={p.id}
              type="button"
              className="roster-entry hud-roster-btn"
              onClick={() => handlePlayerClick(p)}
              aria-label={`Teleport to ${p.name}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 6px',
                backgroundColor: '#2b3f2f',
                color: '#fffaeb',
                border: '1px solid #4a7c59',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </span>
              {p.pomo && p.pomo !== 'none' && (
                <span
                  style={{
                    marginLeft: '4px',
                    fontSize: '9px',
                    padding: '1px 3px',
                    borderRadius: '2px',
                    backgroundColor: p.pomo === 'focus' ? '#3b82f6' : '#10b981',
                    color: '#ffffff',
                  }}
                >
                  {p.pomo}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RosterPanel;
