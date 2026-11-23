import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { StorageManager } from './systems/StorageManager';
import { audioEngine } from './audio/AudioEngine';

describe('apps/web HUD and Audio UI', () => {
  beforeEach(() => {
    StorageManager.reset();
    (audioEngine as any)._unlocked = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the HUD heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lofi-forest');
  });

  // Acceptance criterion:
  // Test: the master slider persists volumes.master.
  it('the master slider persists volumes.master', () => {
    render(<App />);

    const masterSlider = screen.getByLabelText(/master volume/i) as HTMLInputElement;
    expect(masterSlider).toBeDefined();

    // Change master slider value to 0.35
    fireEvent.change(masterSlider, { target: { value: '0.35' } });

    // Assert StorageManager persists volumes.master
    expect(StorageManager.get().volumes.master).toBe(0.35);
    expect(masterSlider.value).toBe('0.35');
  });

  // Acceptance criterion:
  // Test: the pill is visible before unlock and hidden after the first gesture.
  it('the pill is visible before unlock and hidden after the first gesture', async () => {
    // Before gesture: audio is locked
    (audioEngine as any)._unlocked = false;
    if (audioEngine.ctx) {
      vi.spyOn(audioEngine.ctx, 'resume').mockResolvedValue(undefined as any);
    }

    render(<App />);

    // Pill should be visible before unlock
    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();
    expect(pill).not.toBeNull();

    // Trigger gesture (click on pill or pointer down on window)
    fireEvent.click(pill);

    // Pill should now be hidden
    expect(screen.queryByText('Click to enable sound')).toBeNull();
  });
});
