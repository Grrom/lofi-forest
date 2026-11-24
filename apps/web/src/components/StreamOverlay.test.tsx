import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { StreamOverlay } from './StreamOverlay';

describe('StreamOverlay component', () => {
  // Acceptance criterion:
  // Test: the overlay shows FOCUS 42:18 with 2 538 000 ms remaining, plus the current track title.
  it('the overlay shows FOCUS 42:18 with 2 538 000 ms remaining, plus the current track title', () => {
    const mockTrack = {
      title: 'Midnight Forest Stream',
      artist: 'Cozy Contabo Lofi',
    };

    const mockAudio = {
      currentTrack: () => mockTrack,
      onTrackChange: () => () => {},
    };

    // In a 50/10 cycle (cycle = 3 600 000 ms, focus = 3 000 000 ms),
    // focus ends at endsAtMs = K*3600000 + 3000000.
    // For 2 538 000 ms remaining in focus phase:
    // nowMs = K*3600000 + 3000000 - 2538000
    // With K = 10, nowMs = 36000000 + 3000000 - 2538000 = 36462000.
    const fixedNowMs = 10 * 3600000 + 3000000 - 2538000;

    render(
      <StreamOverlay
        focusMin={50}
        breakMin={10}
        now={() => fixedNowMs}
        audio={mockAudio}
        siteHost="forest.lofi.co"
      />
    );

    // 1. Countdown display: FOCUS 42:18
    const timerElem = screen.getByText('FOCUS 42:18');
    expect(timerElem).toBeDefined();

    // 2. Current track title
    expect(screen.getByText(/Midnight Forest Stream/)).toBeDefined();
    expect(screen.getByText(/Cozy Contabo Lofi/)).toBeDefined();

    // 3. Footer with site host
    expect(
      screen.getByText(/Join this world in your browser: forest\.lofi\.co/)
    ).toBeDefined();
  });

  it('renders break countdown when in break phase and updates on 250ms tick', () => {
    vi.useFakeTimers();

    // In a 50/10 cycle, break ends at endsAtMs = (K + 1) * 3600000.
    // For 8 min 45 sec (525 000 ms) remaining in break phase:
    // nowMs = 11 * 3600000 - 525000 = 39075000.
    let currentNowMs = 11 * 3600000 - 525000;

    render(
      <StreamOverlay
        focusMin={50}
        breakMin={10}
        now={() => currentNowMs}
        audio={{ currentTrack: () => null }}
        siteHost="localhost:5173"
      />
    );

    // Break countdown
    expect(screen.getByText('BREAK 08:45')).toBeDefined();
    expect(
      screen.getByText(/Join this world in your browser: localhost:5173/)
    ).toBeDefined();

    // Advance clock by 1000 ms and trigger timer interval
    currentNowMs += 1000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('BREAK 08:44')).toBeDefined();

    vi.useRealTimers();
  });
});
