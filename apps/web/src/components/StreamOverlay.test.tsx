import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

    // Render with 2 538 000 ms remaining and mock audio
    render(
      <StreamOverlay
        focusMin={50}
        breakMin={10}
        remainingMsOverride={2538000}
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

  it('renders break countdown when in break phase', () => {
    // 8 min 45 sec = 525 000 ms
    render(
      <StreamOverlay
        focusMin={50}
        breakMin={10}
        now={() => 3000000 + 75000} // break phase
        remainingMsOverride={525000}
        audio={{ currentTrack: () => null }}
        siteHost="localhost:5173"
      />
    );

    // Break countdown
    expect(screen.getByText(/BREAK 08:45/)).toBeDefined();
    expect(
      screen.getByText(/Join this world in your browser: localhost:5173/)
    ).toBeDefined();
  });
});
