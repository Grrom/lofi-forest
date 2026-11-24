import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { RoomControls } from './RoomControls';
import * as trysteroModule from 'trystero/nostr';

describe('RoomControls and URL handling', () => {
  let mockRoom: any;
  let joinRoomSpy: any;

  beforeEach(() => {
    mockRoom = {
      makeAction: vi.fn(() => [vi.fn(), vi.fn()]),
      onPeerJoin: vi.fn(),
      onPeerLeave: vi.fn(),
      getPeers: vi.fn(() => ({})),
      leaveRoom: vi.fn(),
    };
    joinRoomSpy = vi.spyOn(trysteroModule, 'joinRoom').mockImplementation(() => mockRoom);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  // Acceptance criterion:
  // Test: creating a room with password x calls joinRoom with password: 'x' and sets the URL to ?room=<code>&locked=1 without the password; creating without one passes no password and adds no locked.
  it('Test: creating a room with password x calls joinRoom with password: \'x\' and sets the URL to ?room=<code>&locked=1 without the password; creating without one passes no password and adds no locked', async () => {
    // 1. Create with password 'x'
    const { unmount } = render(<RoomControls />);

    // Open create dialog
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    // Dialog is visible
    expect(screen.getByRole('dialog', { name: /create room/i })).toBeDefined();

    // Type password 'x'
    const passwordInput = screen.getByLabelText(/room password/i);
    fireEvent.change(passwordInput, { target: { value: 'x' } });

    // Submit creation
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm create room/i }));
    });

    // Check joinRoom called with password: 'x'
    expect(joinRoomSpy).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'x' }),
      expect.stringMatching(/^[a-z]+-\d{3}$/)
    );

    // URL set to ?room=<code>&locked=1 without the password 'x'
    const urlSearch = window.location.search;
    expect(urlSearch).toMatch(/^\?room=[a-z]+-\d{3}&locked=1$/);
    expect(urlSearch).not.toContain('x');

    // Shows "Copy link" button
    expect(screen.getByRole('button', { name: /copy link/i })).toBeDefined();

    unmount();
    joinRoomSpy.mockClear();
    window.history.replaceState(null, '', '/');

    // 2. Create without password
    render(<RoomControls />);

    // Open create dialog
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    // Submit creation without password
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm create room/i }));
    });

    // joinRoom called without password property
    expect(joinRoomSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ password: expect.anything() }),
      expect.stringMatching(/^[a-z]+-\d{3}$/)
    );

    // URL set to ?room=<code> and adds no locked
    const urlSearchOpen = window.location.search;
    expect(urlSearchOpen).toMatch(/^\?room=[a-z]+-\d{3}$/);
    expect(urlSearchOpen).not.toContain('locked');
  });

  // Acceptance criterion:
  // Test: opening ?room=pine-482&locked=1 shows the password prompt and does not call joinRoom until it is submitted.
  it('Test: opening ?room=pine-482&locked=1 shows the password prompt and does not call joinRoom until it is submitted', async () => {
    // Set URL
    window.history.replaceState(null, '', '?room=pine-482&locked=1');

    render(<RoomControls />);

    // Shows the password prompt
    const promptDialog = screen.getByRole('dialog', { name: /password required/i });
    expect(promptDialog).toBeDefined();

    // Does not call joinRoom until it is submitted
    expect(joinRoomSpy).not.toHaveBeenCalled();

    // Enter password
    const pwdInput = screen.getByLabelText(/^password$/i);
    fireEvent.change(pwdInput, { target: { value: 'secret-pine' } });

    // Submit
    const joinBtn = screen.getByRole('button', { name: /join room/i });
    await act(async () => {
      fireEvent.click(joinBtn);
    });

    // Now joinRoom is called
    expect(joinRoomSpy).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'secret-pine' }),
      'pine-482'
    );
  });

  it('in a locked room with no peers after 10 s, shows "Nobody here yet, or the password is wrong"', async () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, '', '?room=pine-482&locked=1');
      render(<RoomControls />);

      const pwdInput = screen.getByLabelText(/^password$/i);
      fireEvent.change(pwdInput, { target: { value: 'my-pass' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join room/i }));
      });

      // Initially no warning
      expect(screen.queryByRole('alert')).toBeNull();

      // Advance 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Warning appears
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Nobody here yet, or the password is wrong');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaving a room returns to solo and resets the URL', async () => {
    window.history.replaceState(null, '', '?room=pine-482');
    render(<RoomControls />);

    // In room: Leave room button is present
    const leaveBtn = screen.getByRole('button', { name: /leave room/i });
    expect(leaveBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(leaveBtn);
    });

    // URL cleared
    expect(window.location.search).toBe('');

    // Returns to solo: "Create Room" button is back
    expect(screen.getByRole('button', { name: /create room/i })).toBeDefined();
  });
});
