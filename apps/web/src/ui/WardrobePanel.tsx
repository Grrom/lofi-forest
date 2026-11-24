import React, { useState, useEffect } from 'react';
import { StorageManager, usePrefs } from '../systems/StorageManager';
import { assetLoader } from '../engine/assets/AssetLoader';
import { HAT_IDS, sanitizeName, type HatId } from '@lofi/shared';

export const PALETTE_PRESETS = [
  '#ffffff', // Classic White
  '#4a7c59', // Forest Pine
  '#c2410c', // Cozy Amber
  '#3b82f6', // Lake Blue
  '#8b5cf6', // Lavender Purple
  '#ec4899', // Blossom Pink
  '#eab308', // Autumn Gold
  '#475569', // Slate Gray
] as const;

export interface WardrobePanelProps {
  onClose?: () => void;
}

export function WardrobePanel({ onClose }: WardrobePanelProps) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.profile.name);

  // Sync state if prefs change externally
  useEffect(() => {
    if (sanitizeName(name) !== prefs.profile.name) {
      setName(prefs.profile.name);
    }
  }, [prefs.profile.name]);

  // Hat options from manifest or shared constants
  const hats: readonly (HatId | string)[] =
    assetLoader.getManifest()?.sprites?.hats?.map((h) => h.id) ?? HAT_IDS;

  const currentHat = prefs.profile.outfit.hatId;
  const currentColor = prefs.profile.outfit.colorHex;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Block invalid characters as you type: letters, digits, and spaces only, max 16 chars
    const filtered = raw.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 16);
    setName(filtered);
    if (filtered.trim().length > 0) {
      StorageManager.update((prev) => ({
        profile: {
          ...prev.profile,
          name: filtered,
        },
      }));
    }
  };

  const handleNameBlur = () => {
    if (name.trim().length === 0) {
      setName('Wanderer');
      StorageManager.update((prev) => ({
        profile: {
          ...prev.profile,
          name: 'Wanderer',
        },
      }));
    } else {
      const sanitized = sanitizeName(name);
      setName(sanitized);
      StorageManager.update((prev) => ({
        profile: {
          ...prev.profile,
          name: sanitized,
        },
      }));
    }
  };

  const handleSelectHat = (hatId: string) => {
    StorageManager.update((prev) => ({
      profile: {
        ...prev.profile,
        outfit: {
          ...prev.profile.outfit,
          hatId,
        },
      },
    }));
  };

  const handleSelectColor = (colorHex: string) => {
    StorageManager.update((prev) => ({
      profile: {
        ...prev.profile,
        outfit: {
          ...prev.profile.outfit,
          colorHex,
        },
      },
    }));
  };

  return (
    <div
      className="wardrobe-panel"
      role="dialog"
      aria-label="Wardrobe"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: '#211509',
        border: '2px solid #b58351',
        borderRadius: '6px',
        color: '#fffaeb',
        fontFamily: 'monospace',
        padding: '16px',
        width: '320px',
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
          borderBottom: '1px solid #4a3419',
          paddingBottom: '6px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase' }}>
          Wardrobe
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Wardrobe"
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
        )}
      </div>

      {/* Name Input */}
      <div style={{ marginBottom: '14px' }}>
        <label
          htmlFor="wardrobe-name-input"
          style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}
        >
          Character Name
        </label>
        <input
          id="wardrobe-name-input"
          type="text"
          value={name}
          maxLength={16}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          aria-label="Character Name"
          placeholder="Wanderer"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#342311',
            border: '1px solid #745125',
            color: '#fffaeb',
            padding: '6px 8px',
            fontFamily: 'monospace',
            fontSize: '12px',
            borderRadius: '3px',
          }}
        />
      </div>

      {/* Palette Presets */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12px', marginBottom: '6px' }}>Clothing Color</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
          }}
        >
          {PALETTE_PRESETS.map((color) => {
            const isSelected = currentColor.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                onClick={() => handleSelectColor(color)}
                aria-label={`Palette: ${color}`}
                style={{
                  height: '28px',
                  backgroundColor: color,
                  border: isSelected ? '2px solid #fffaeb' : '1px solid #140d06',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 0 4px #fffaeb' : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Hat Picker */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', marginBottom: '6px' }}>Hat</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6px',
          }}
        >
          {hats.map((hatId) => {
            const isSelected = currentHat === hatId;
            return (
              <button
                key={hatId}
                type="button"
                onClick={() => handleSelectHat(hatId)}
                aria-label={`Hat: ${hatId}`}
                style={{
                  padding: '6px 8px',
                  backgroundColor: isSelected ? '#4a7c59' : '#342311',
                  border: isSelected ? '1px solid #7bc662' : '1px solid #745125',
                  color: '#fffaeb',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {hatId}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default WardrobePanel;
