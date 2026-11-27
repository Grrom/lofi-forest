import React, { useState, useEffect, useRef } from 'react';
import { generateRoomCode } from '../net/roomCode';
import { TrysteroTransport } from '../net/TrysteroTransport';
import { LocalTransport } from '../net/LocalTransport';
import { gameEngine } from '../engine/game';
import { gameEvents } from '../engine/events';
import type { TransportAdapter } from '../net/TransportAdapter';

export interface RoomControlsProps {
  onTransportChange?: (transport: TransportAdapter) => void;
}

export function RoomControls({ onTransportChange }: RoomControlsProps) {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [isLockedRoom, setIsLockedRoom] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingJoinRoom, setPendingJoinRoom] = useState<string | null>(null);

  const [createPassword, setCreatePassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomWarning, setRoomWarning] = useState<string | null>(null);
  const [isRoomFull, setIsRoomFull] = useState(false);

  const lockedTimeoutRef = useRef<any>(null);
  const hasPeersRef = useRef(false);

  // Initialize from URL search params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const lockedParam = params.get('locked');

    if (roomParam) {
      if (lockedParam === '1') {
        // Locked room requires password prompt before connecting
        setPendingJoinRoom(roomParam);
        setShowPasswordPrompt(true);
      } else {
        // Open room connects directly
        setCurrentRoom(roomParam);
        setIsLockedRoom(false);
      }
    }
  }, []);

  // Monitor peers in locked rooms for the 10-second warning
  useEffect(() => {
    if (!currentRoom || !isLockedRoom) {
      if (lockedTimeoutRef.current) {
        clearTimeout(lockedTimeoutRef.current);
        lockedTimeoutRef.current = null;
      }
      setRoomWarning(null);
      return;
    }

    hasPeersRef.current = false;
    setRoomWarning(null);

    // In a locked room with no peers after 10 s, show "Nobody here yet, or the password is wrong"
    lockedTimeoutRef.current = setTimeout(() => {
      if (!hasPeersRef.current) {
        setRoomWarning('Nobody here yet, or the password is wrong');
      }
    }, 10000);

    const unsub = gameEvents.on('playersChanged', ({ players }) => {
      if (players && players.size > 0) {
        hasPeersRef.current = true;
        setRoomWarning(null);
        if (lockedTimeoutRef.current) {
          clearTimeout(lockedTimeoutRef.current);
          lockedTimeoutRef.current = null;
        }
      }
    });

    return () => {
      unsub();
      if (lockedTimeoutRef.current) {
        clearTimeout(lockedTimeoutRef.current);
        lockedTimeoutRef.current = null;
      }
    };
  }, [currentRoom, isLockedRoom]);

  // Monitor connection status changes for room_full
  useEffect(() => {
    const unsub = gameEvents.on('connectionStatusChanged', ({ status }) => {
      if (status === 'room_full') {
        if (currentRoom) {
          setIsRoomFull(true);
        }
      } else if (status === 'connected') {
        setIsRoomFull(false);
      }
    });

    return () => {
      unsub();
    };
  }, [currentRoom]);

  const handleCreateRoom = async () => {
    const code = generateRoomCode();
    const pwd = createPassword.trim();

    // Sets the URL via history.replaceState to ?room=<code>, plus &locked=1 when a password is set
    const url = pwd ? `?room=${code}&locked=1` : `?room=${code}`;
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', url);
    }

    const transport = new TrysteroTransport(code, pwd ? { password: pwd } : undefined);
    if (onTransportChange) {
      onTransportChange(transport);
    } else if (gameEngine?.setTransport) {
      await gameEngine.setTransport(transport);
    } else {
      await transport.connect();
    }

    setCurrentRoom(code);
    setIsLockedRoom(Boolean(pwd));
    setIsRoomFull(false);
    setShowCreateDialog(false);
    setCreatePassword('');
  };

  const handleJoinLockedRoom = async () => {
    if (!pendingJoinRoom) return;
    const pwd = joinPassword.trim();
    const code = pendingJoinRoom;

    const transport = new TrysteroTransport(code, pwd ? { password: pwd } : undefined);
    if (onTransportChange) {
      onTransportChange(transport);
    } else if (gameEngine?.setTransport) {
      await gameEngine.setTransport(transport);
    } else {
      await transport.connect();
    }

    setCurrentRoom(code);
    setIsLockedRoom(true);
    setIsRoomFull(false);
    setShowPasswordPrompt(false);
    setJoinPassword('');
    setPendingJoinRoom(null);
  };

  const handleCancelJoinLockedRoom = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setShowPasswordPrompt(false);
    setPendingJoinRoom(null);
    setJoinPassword('');
  };

  const handleLeaveRoom = async () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    const solo = new LocalTransport();
    if (onTransportChange) {
      onTransportChange(solo);
    } else if (gameEngine?.setTransport) {
      await gameEngine.setTransport(solo);
    } else {
      solo.connect();
    }

    setCurrentRoom(null);
    setIsLockedRoom(false);
    setIsRoomFull(false);
    setRoomWarning(null);
    if (lockedTimeoutRef.current) {
      clearTimeout(lockedTimeoutRef.current);
      lockedTimeoutRef.current = null;
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="hud-room-controls" style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        {!currentRoom ? (
          <button
            type="button"
            className="hud-create-room-btn"
            onClick={() => setShowCreateDialog(true)}
            aria-label="Create Room"
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
            Create Room
          </button>
        ) : (
          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#9ae6b4',
                padding: '2px 6px',
                backgroundColor: '#1c2e20',
                border: '1px solid #4a7c59',
                borderRadius: '4px',
              }}
            >
              Room: {currentRoom} {isLockedRoom && '🔒'}
            </span>
            {!isRoomFull && (
              <button
                type="button"
                className="hud-copy-link-btn"
                onClick={handleCopyLink}
                aria-label="Copy link"
                style={{
                  padding: '4px 8px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  cursor: 'pointer',
                  backgroundColor: copied ? '#4a7c59' : '#2b3f2f',
                  color: '#fffaeb',
                  border: '1px solid #4a7c59',
                  borderRadius: '4px',
                }}
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            )}
            <button
              type="button"
              className="hud-leave-room-btn"
              onClick={handleLeaveRoom}
              aria-label="Leave room"
              style={{
                padding: '4px 8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                cursor: 'pointer',
                backgroundColor: '#3b2323',
                color: '#ffcccc',
                border: '1px solid #782d2d',
                borderRadius: '4px',
              }}
            >
              Leave room
            </button>
          </div>
        )}
      </div>

      {/* Alert banner when room is full */}
      {isRoomFull && currentRoom && (
        <div
          role="alert"
          className="hud-room-full-alert"
          style={{
            position: 'fixed',
            bottom: '48px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#3b1414',
            color: '#fecaca',
            border: '1px solid #dc2626',
            borderRadius: '4px',
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          This room is full (max 10)
        </div>
      )}

      {/* Warning banner for locked room without peers */}
      {roomWarning && (
        <div
          role="alert"
          className="hud-room-warning"
          style={{
            position: 'fixed',
            bottom: '48px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#3b2a14',
            color: '#fef3c7',
            border: '1px solid #d97706',
            borderRadius: '4px',
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 9999,
          }}
        >
          {roomWarning}
        </div>
      )}

      {/* Create Room Dialog */}
      {showCreateDialog && (
        <div
          className="create-room-modal"
          role="dialog"
          aria-label="Create Room"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1b2a1e',
            border: '2px solid #4a7c59',
            borderRadius: '6px',
            color: '#fffaeb',
            fontFamily: 'monospace',
            padding: '16px',
            width: '280px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              borderBottom: '1px solid #334433',
              paddingBottom: '6px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase' }}>
              Create P2P Room
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateDialog(false)}
              aria-label="Close dialog"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fffaeb',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="create-room-password"
              style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}
            >
              Password (optional)
            </label>
            <input
              id="create-room-password"
              type="password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              aria-label="Room password"
              placeholder="Optional password"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#142017',
                border: '1px solid #334433',
                color: '#fffaeb',
                padding: '6px 8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                borderRadius: '3px',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowCreateDialog(false)}
              style={{
                padding: '6px 12px',
                fontFamily: 'monospace',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#e0eee0',
                border: '1px solid #334433',
                borderRadius: '3px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateRoom}
              aria-label="Confirm create room"
              style={{
                padding: '6px 12px',
                fontFamily: 'monospace',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: '#4a7c59',
                color: '#ffffff',
                border: '1px solid #7bc662',
                borderRadius: '3px',
                fontWeight: 'bold',
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Password Prompt Dialog for Locked Room */}
      {showPasswordPrompt && (
        <div
          className="password-prompt-modal"
          role="dialog"
          aria-label="Password Required"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1b2a1e',
            border: '2px solid #4a7c59',
            borderRadius: '6px',
            color: '#fffaeb',
            fontFamily: 'monospace',
            padding: '16px',
            width: '280px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              borderBottom: '1px solid #334433',
              paddingBottom: '6px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase' }}>
              Locked Room
            </h2>
            <button
              type="button"
              onClick={handleCancelJoinLockedRoom}
              aria-label="Close dialog"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fffaeb',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '12px', marginBottom: '10px' }}>
            This room requires a password to enter.
          </p>

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="join-room-password"
              style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}
            >
              Password
            </label>
            <input
              id="join-room-password"
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJoinLockedRoom();
                }
              }}
              aria-label="Password"
              placeholder="Enter password"
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#142017',
                border: '1px solid #334433',
                color: '#fffaeb',
                padding: '6px 8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                borderRadius: '3px',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCancelJoinLockedRoom}
              aria-label="Cancel"
              style={{
                padding: '6px 12px',
                fontFamily: 'monospace',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#e0eee0',
                border: '1px solid #334433',
                borderRadius: '3px',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleJoinLockedRoom}
              aria-label="Join Room"
              style={{
                padding: '6px 12px',
                fontFamily: 'monospace',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: '#4a7c59',
                color: '#ffffff',
                border: '1px solid #7bc662',
                borderRadius: '3px',
                fontWeight: 'bold',
              }}
            >
              Join
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default RoomControls;
