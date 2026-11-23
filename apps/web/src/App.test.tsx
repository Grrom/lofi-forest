import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { StorageManager } from './systems/StorageManager';
import { audioEngine } from './audio/AudioEngine';
import { createMockAudioContext } from './audio/mockAudioContext';

describe('apps/web HUD and Audio UI', () => {
  beforeEach(() => {
    StorageManager.reset();
    const mockCtx = createMockAudioContext(0);
    audioEngine.resetForTest(mockCtx);
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
    render(<App />);

    // Pill should be visible before unlock
    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();
    expect(pill).not.toBeNull();

    // Trigger gesture (pointerdown on window)
    fireEvent.pointerDown(window);

    // Pill should now be hidden after gesture unlocks audio
    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });

  it('clicking the pill unlocks audio as well', async () => {
    render(<App />);

    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();

    fireEvent.click(pill);

    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });

  it('keydown gesture on window unlocks audio and hides pill', async () => {
    render(<App />);

    const pill = screen.getByText('Click to enable sound');
    expect(pill).toBeDefined();

    fireEvent.keyDown(window, { key: ' ' });

    await waitFor(() => {
      expect(screen.queryByText('Click to enable sound')).toBeNull();
    });
  });
});
