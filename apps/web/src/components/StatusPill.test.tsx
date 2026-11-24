import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders status pill with connection status label', () => {
    const { rerender } = render(<StatusPill status="connected" />);
    expect(screen.getByLabelText(/connection status/i).textContent).toContain('Connected');

    rerender(<StatusPill status="connecting" />);
    expect(screen.getByLabelText(/connection status/i).textContent).toContain('Connecting...');

    rerender(<StatusPill status="reconnecting" />);
    expect(screen.getByLabelText(/connection status/i).textContent).toContain('Reconnecting...');

    rerender(<StatusPill status="disconnected" />);
    expect(screen.getByLabelText(/connection status/i).textContent).toContain('Disconnected');

    rerender(<StatusPill status="room_full" />);
    expect(screen.getByLabelText(/connection status/i).textContent).toContain('Room Full');
  });
});
