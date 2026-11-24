import React from 'react';
import { EMOTE_IDS, type EmoteId } from '@lofi/shared';
import { gameEngine } from '../engine/game';
import { gameEvents } from '../engine/events';

export const EMOTE_DATA: Record<
  EmoteId,
  { hotkey: string; label: string; icon: string }
> = {
  heart: { hotkey: '1', label: 'Heart', icon: '❤️' },
  coffee: { hotkey: '2', label: 'Coffee', icon: '☕' },
  music: { hotkey: '3', label: 'Music', icon: '🎵' },
  wave: { hotkey: '4', label: 'Wave', icon: '👋' },
  zzz: { hotkey: '5', label: 'Zzz', icon: '💤' },
  sparkle: { hotkey: '6', label: 'Sparkle', icon: '✨' },
};

let standaloneLastEmoteTime = -Infinity;

export function triggerLocalEmote(
  emoteId: EmoteId,
  now: number = Date.now()
): boolean {
  if (gameEngine?.player) {
    return gameEngine.player.triggerEmote(emoteId, now);
  }
  if (now - standaloneLastEmoteTime < 1000) {
    return false;
  }
  standaloneLastEmoteTime = now;
  gameEvents.emit('localInput', {});
  gameEvents.emit('localEmote', { emote: emoteId });
  return true;
}

export function resetStandaloneEmoteCooldown(): void {
  standaloneLastEmoteTime = -Infinity;
}

export function EmoteBar() {
  const handleEmoteClick = (emoteId: EmoteId) => {
    triggerLocalEmote(emoteId);
  };

  return (
    <div
      className="hud-emote-bar"
      role="toolbar"
      aria-label="Emotes"
      style={{
        position: 'fixed',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        gap: '6px',
        padding: '4px 6px',
        background: 'rgba(20, 25, 20, 0.85)',
        border: '1px solid #334433',
        borderRadius: '8px',
        userSelect: 'none',
      }}
    >
      {EMOTE_IDS.map((id) => {
        const data = EMOTE_DATA[id];
        return (
          <button
            key={id}
            type="button"
            className={`hud-emote-btn hud-emote-btn-${id}`}
            aria-label={`Emote ${id}`}
            title={`${data.label} (${data.hotkey})`}
            onClick={(e) => {
              e.currentTarget.blur();
              handleEmoteClick(id);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
              handleEmoteClick(id);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
              minHeight: '36px',
              padding: '2px 4px',
              background: 'rgba(30, 40, 30, 0.9)',
              border: '1px solid #445544',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#e0eee0',
              fontFamily: 'monospace',
              touchAction: 'manipulation',
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: '1' }}>{data.icon}</span>
            <span
              style={{
                fontSize: '9px',
                opacity: 0.7,
                lineHeight: '1',
                marginTop: '2px',
              }}
            >
              {data.hotkey}
            </span>
          </button>
        );
      })}
    </div>
  );
}
