import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WardrobePanel, PALETTE_PRESETS } from './WardrobePanel';
import { StorageManager } from '../systems/StorageManager';

describe('WardrobePanel', () => {
  beforeEach(() => {
    StorageManager.reset();
  });

  afterEach(() => {
    StorageManager.reset();
  });

  // Acceptance criterion:
  // Test: the wardrobe name input rejects !/emoji and caps at 16, and saving updates StorageManager.
  it('the wardrobe name input rejects !/emoji and caps at 16, and saving updates StorageManager', () => {
    render(<WardrobePanel />);

    const input = screen.getByLabelText(/character name/i) as HTMLInputElement;
    expect(input).toBeDefined();

    // Type name with exclamation marks, emojis, and length > 16
    // 'Hero!😀1234567890123456789'
    // Characters rejected: '!' and '😀'
    // Remaining valid: 'Hero1234567890123456789'
    // Capped at 16: 'Hero123456789012'
    fireEvent.change(input, { target: { value: 'Hero!😀1234567890123456789' } });

    expect(input.value).toBe('Hero123456789012');
    expect(input.value.length).toBe(16);
    expect(input.value).not.toContain('!');
    expect(input.value).not.toContain('😀');

    // StorageManager should be updated immediately with the sanitized name
    const stored = StorageManager.get();
    expect(stored.profile.name).toBe('Hero123456789012');
  });

  it('selects from 8 palette presets and updates StorageManager immediately', () => {
    render(<WardrobePanel />);

    expect(PALETTE_PRESETS).toHaveLength(8);

    // Pick forest green '#4a7c59'
    const colorBtn = screen.getByRole('button', { name: 'Palette: #4a7c59' });
    fireEvent.click(colorBtn);

    expect(StorageManager.get().profile.outfit.colorHex).toBe('#4a7c59');

    // Pick cozy amber '#c2410c'
    const amberBtn = screen.getByRole('button', { name: 'Palette: #c2410c' });
    fireEvent.click(amberBtn);

    expect(StorageManager.get().profile.outfit.colorHex).toBe('#c2410c');
  });

  it('selects hat from manifest hats and updates StorageManager immediately', () => {
    render(<WardrobePanel />);

    const beanieBtn = screen.getByRole('button', { name: 'Hat: beanie' });
    fireEvent.click(beanieBtn);

    expect(StorageManager.get().profile.outfit.hatId).toBe('beanie');

    const flowerBtn = screen.getByRole('button', { name: 'Hat: flower' });
    fireEvent.click(flowerBtn);

    expect(StorageManager.get().profile.outfit.hatId).toBe('flower');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<WardrobePanel onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: /close wardrobe/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
