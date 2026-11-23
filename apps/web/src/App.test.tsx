import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('apps/web HUD', () => {
  it('renders the HUD heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lofi-forest');
  });

  it('renders the Auto-Stroll HUD toggle and allows toggling', () => {
    render(<App />);
    const strollBtn = screen.getByRole('button', { name: /toggle auto-stroll/i });
    expect(strollBtn).toBeDefined();
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');

    // Toggle on
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: ON');

    // Toggle off
    fireEvent.click(strollBtn);
    expect(strollBtn.textContent).toContain('Auto-Stroll: OFF');
  });
});
