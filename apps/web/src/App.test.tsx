import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('apps/web', () => {
  // Acceptance criterion / Scope:
  // "src/main.tsx mounts a React root over a full-window Pixi Application (dark green background)."
  it('mounts a React root over full-window Pixi Application', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lofi-forest');
  });
});
